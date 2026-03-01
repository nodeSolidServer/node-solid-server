'use strict'

import chai from 'chai'
import { verifyNostrAuth } from '../../lib/api/authn/webid-nostr.mjs'

const { expect } = chai

/**
 * Official test vectors from:
 * https://github.com/nostrcg/http-schnorr-auth/tree/gh-pages/test-vectors
 */
const TEST_KEYS = {
  privateKey: 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
  publicKey: '39a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c2'
}

// Timestamp used in test vectors
const VECTOR_TIME = 1768201820

const vectors = [
  {
    id: 'valid-get-request',
    description: 'Valid GET request authentication event',
    expected: 'ACCEPT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/resource'], ['method', 'GET']],
      content: '',
      id: '7e30b0e2a92f91ad632c70ff8c717357779743ab93459f1c43b165c1f032d53b',
      sig: '8d5f22b8ced69a1be8fde0c1ad2fde4e67172d9a9dfe13d71c9868025ae96a8aa16fd29a8097b5610a0179477a2d5ce0f53aaf42a5884fa09f66e262dd2e9a66'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'valid-post-with-payload',
    description: 'Valid POST request with payload hash',
    expected: 'ACCEPT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/api/data'], ['method', 'POST'], ['payload', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']],
      content: '',
      id: '9d44e19adab461ef1516a77b5bad2f97cd2208831774b9b4bf5477c1046f61a2',
      sig: '4b30247bc71187415e93a4d51a00c4a1f7932e0216c2802f9a83782584e3afb97b023b88c04f82327d99c8b3324b374d19b3ab6e5d4401d56ad44f43ab1c9c59'
    },
    request: { url: 'https://example.com/api/data', method: 'POST', body: 'abc' }
  },
  {
    id: 'invalid-signature',
    description: 'Event with corrupted signature',
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/resource'], ['method', 'GET']],
      content: '',
      id: '7e30b0e2a92f91ad632c70ff8c717357779743ab93459f1c43b165c1f032d53b',
      sig: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'wrong-kind',
    description: 'Event with wrong kind (not 27235)',
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 1,
      tags: [['u', 'https://example.com/resource'], ['method', 'GET']],
      content: '',
      id: 'e6d3cba811b23b3eb2551ec712ab972875c20b6b0e6225314dd8b810327735be',
      sig: '5aa6295c4e45b348326630bf540f43ee294799a2009438ea199e029e9b4cfb626bb9285bdaa2fcfd9f2c554a330adb8edd43681cc9d9afca6db363d6cb226a1e'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'expired-event',
    description: 'Event older than 60 seconds',
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: 1768198220,
      kind: 27235,
      tags: [['u', 'https://example.com/resource'], ['method', 'GET']],
      content: '',
      id: 'aea08c9afa4bf51953468fc918d7fc5f639d5c4ee6b3e874ecc866679890fbe1',
      sig: '49abc3b2088be5a370092667901a5c1f47c56ebce14b719464953dfaaa9623e848ea28f3806be48c24eef4bc18fb20388bf8f99ef6797a3498c83cefeac5e6c5'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'url-mismatch',
    description: "URL in event doesn't match request URL",
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://other-domain.com/resource'], ['method', 'GET']],
      content: '',
      id: '32cd636e16bb22b6a37ebbb204fcb046db838ff2126a5d965f4bb0acfb082036',
      sig: 'f8cb9db62dcb3cdc27ba503cd8ca47b77d706f4fe5ea5c875f451099a39295fbf80d4a3848b2a2438073639e60a89037c8c84a94640101262958b30afeee3820'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'method-mismatch',
    description: "Method in event doesn't match request method",
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/resource'], ['method', 'POST']],
      content: '',
      id: 'b10d56dea0bfefe6162a37953f93e9fda5477891114c703a039924e1255515b0',
      sig: '76768d5597b572c69ad3c5095497fc842308647fdbd3c202e103f3b1ea8c89169864bc2cb6ce190bf4a7d4d8114164926f24d3905d9db5278a7fc4fc962d84a6'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'missing-url-tag',
    description: "Event missing required 'u' tag",
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['method', 'GET']],
      content: '',
      id: '6cc99dd3be1d768c1de517f114b4380b827689d27b4076347736f80dd91c1e63',
      sig: '185efa7d07c5afb19ccf18e0dd76404e5d4747a1d938b6d285a21ec87a10959e7e18c07214b334f32a8917945178dc8318db34f0d65e8afebaca8181f0de4aed'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'missing-method-tag',
    description: "Event missing required 'method' tag",
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/resource']],
      content: '',
      id: 'a83f9fbaac743311073a6d5ccf99c144168f66722d4e0814e40757e8c1a110e4',
      sig: 'cf1272445451f7ea0997689e82c8038f2bad2dbacc0035a0a87e98b037672a534519b8bea8a6f17b92fedf3ec5b16839a12a73a6f003883582addb5e4663cf9a'
    },
    request: { url: 'https://example.com/resource', method: 'GET' }
  },
  {
    id: 'payload-hash-mismatch',
    description: "Payload hash doesn't match request body",
    expected: 'REJECT',
    event: {
      pubkey: TEST_KEYS.publicKey,
      created_at: VECTOR_TIME,
      kind: 27235,
      tags: [['u', 'https://example.com/api/data'], ['method', 'POST'], ['payload', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']],
      content: '',
      id: '9d44e19adab461ef1516a77b5bad2f97cd2208831774b9b4bf5477c1046f61a2',
      sig: '4b30247bc71187415e93a4d51a00c4a1f7932e0216c2802f9a83782584e3afb97b023b88c04f82327d99c8b3324b374d19b3ab6e5d4401d56ad44f43ab1c9c59'
    },
    request: { url: 'https://example.com/api/data', method: 'POST', body: 'different body content' }
  }
]

/**
 * Build a mock Express request from a test vector.
 */
function mockRequest (vector) {
  const authHeader = 'Nostr ' + Buffer.from(JSON.stringify(vector.event)).toString('base64')
  return {
    method: vector.request.method,
    body: vector.request.body || null,
    absoluteUrl: vector.request.url,
    get (header) {
      if (header === 'Authorization') return authHeader
      return null
    }
  }
}

describe('Nostr HTTP Schnorr Authentication', () => {
  describe('official test vectors', () => {
    for (const vector of vectors) {
      it(`${vector.id}: ${vector.description}`, async () => {
        const req = mockRequest(vector)
        const result = await verifyNostrAuth(req, { now: VECTOR_TIME })
        if (vector.expected === 'ACCEPT') {
          expect(result).to.equal(`did:nostr:${TEST_KEYS.publicKey}`)
        } else {
          expect(result).to.be.null
        }
      })
    }
  })

  describe('edge cases', () => {
    it('returns null when no Authorization header', async () => {
      const req = { method: 'GET', get: () => null }
      const result = await verifyNostrAuth(req)
      expect(result).to.be.null
    })

    it('returns null for non-Nostr Authorization header', async () => {
      const req = { method: 'GET', get: (h) => h === 'Authorization' ? 'Bearer token123' : null }
      const result = await verifyNostrAuth(req)
      expect(result).to.be.null
    })

    it('returns null for malformed base64', async () => {
      const req = { method: 'GET', get: (h) => h === 'Authorization' ? 'Nostr !!!invalid!!!' : null }
      const result = await verifyNostrAuth(req)
      expect(result).to.be.null
    })
  })
})
