'use strict'

import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import Debug from 'debug'

const debug = Debug('solid:authn:nostr')

/**
 * Verifies a NIP-98 HTTP Auth event from the Authorization header.
 *
 * @see https://nostrcg.github.io/http-schnorr-auth/
 * @see https://github.com/nostr-protocol/nips/blob/master/98.md
 *
 * @param {object} req - Express request object
 * @param {object} [options] - Options for testing
 * @param {number} [options.now] - Override current time (unix seconds)
 * @returns {string|null} `did:nostr:<pubkey>` on success, null on failure
 */
export async function verifyNostrAuth (req, options = {}) {
  const authHeader = req.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Nostr ')) {
    return null
  }

  debug('Processing Nostr auth...')

  try {
    const base64Event = authHeader.slice(6)
    const eventJson = Buffer.from(base64Event, 'base64').toString('utf-8')
    const event = JSON.parse(eventJson)

    // Validate required fields
    if (!event.pubkey || !event.sig || !event.id || !event.tags) {
      debug('Invalid event structure')
      return null
    }

    // Kind must be 27235 (NIP-98 HTTP Auth)
    if (event.kind !== 27235) {
      debug(`Wrong event kind: ${event.kind}`)
      return null
    }

    // Timestamp within 60 seconds
    const now = options.now || Math.floor(Date.now() / 1000)
    if (Math.abs(now - event.created_at) > 60) {
      debug('Event timestamp out of range')
      return null
    }

    // Required tags
    const urlTag = event.tags.find(t => t[0] === 'u')
    if (!urlTag) {
      debug('Missing URL tag')
      return null
    }

    // Validate URL matches the request
    const requestUrl = req.absoluteUrl ||
      (req.protocol + '://' + req.get('host') + req.originalUrl)
    if (urlTag[1] !== requestUrl) {
      debug(`URL mismatch: ${urlTag[1]} vs ${requestUrl}`)
      return null
    }

    const methodTag = event.tags.find(t => t[0] === 'method')
    if (!methodTag) {
      debug('Missing method tag')
      return null
    }

    if (methodTag[1].toUpperCase() !== req.method.toUpperCase()) {
      debug(`Method mismatch: ${methodTag[1]} vs ${req.method}`)
      return null
    }

    // Verify event ID is SHA-256 of serialized event (NIP-01)
    const serialized = JSON.stringify([
      0, event.pubkey, event.created_at, event.kind, event.tags, event.content
    ])
    const expectedId = bytesToHex(sha256(new TextEncoder().encode(serialized)))
    if (event.id !== expectedId) {
      debug('Event ID mismatch')
      return null
    }

    // Verify BIP-340 Schnorr signature
    const valid = schnorr.verify(event.sig, event.id, event.pubkey)
    if (!valid) {
      debug('Invalid Schnorr signature')
      return null
    }

    // Optional: verify payload hash for requests with bodies
    const payloadTag = event.tags.find(t => t[0] === 'payload')
    if (payloadTag && req.body) {
      const bodyBytes = typeof req.body === 'string'
        ? new TextEncoder().encode(req.body)
        : req.body
      const bodyHash = bytesToHex(sha256(bodyBytes))
      if (payloadTag[1] !== bodyHash) {
        debug('Payload hash mismatch')
        return null
      }
    }

    const webId = `did:nostr:${event.pubkey}`
    debug(`Authenticated: ${webId}`)
    return webId
  } catch (err) {
    debug(`Auth error: ${err.message}`)
    return null
  }
}

export default { verifyNostrAuth }
