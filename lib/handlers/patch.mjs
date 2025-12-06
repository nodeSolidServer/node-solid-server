// Express handler for LDP PATCH requests

import bodyParser from 'body-parser'
import fs from 'fs'
import { handlers as debug } from '../debug.mjs'
import HTTPError from '../http-error.mjs'
import $rdf from 'rdflib'
import crypto from 'crypto'
import { overQuota, getContentType } from '../utils.mjs'
import withLock from '../lock.mjs'
// import sparqlUpdateParser from './patch/sparql-update-parser.js'
// import n3PatchParser from './patch/n3-patch-parser.js'
import sparqlUpdateParser from './patch/sparql-update-parser.js'
import n3PatchParser from './patch/n3-patch-parser.js'
import { Readable } from 'stream'

// Patch parsers by request body content type
const PATCH_PARSERS = {
  'application/sparql-update': sparqlUpdateParser,
  'application/sparql-update-single-match': sparqlUpdateParser,
  'text/n3': n3PatchParser
}

// use media-type as contentType for new RDF resource
const DEFAULT_FOR_NEW_CONTENT_TYPE = 'text/turtle'

function contentTypeForNew (req) {
  let contentTypeForNew = DEFAULT_FOR_NEW_CONTENT_TYPE
  if (req.path.endsWith('.jsonld')) contentTypeForNew = 'application/ld+json'
  else if (req.path.endsWith('.n3')) contentTypeForNew = 'text/n3'
  else if (req.path.endsWith('.rdf')) contentTypeForNew = 'application/rdf+xml'
  return contentTypeForNew
}

export default async function handler (req, res, next) {
  const contentType = getContentType(req.headers)
  debug(`PATCH -- ${req.originalUrl}`)

  // DEBUG: Log the resource path that will be written (guaranteed output)
  try {
    const ldp = req.app.locals.ldp
    const { path: resourcePath } = await ldp.resourceMapper.mapUrlToFile({ url: req, createIfNotExists: true, contentType: contentTypeForNew(req) })
    console.log(`PATCH -- [DEBUG] Will write to file: ${resourcePath}`)
  } catch (e) {
    console.log(`PATCH -- [DEBUG] Error resolving file path: ${e.message}`)
  }

  // Parse the body (req.body will be set to true if empty body)
  if (contentType in PATCH_PARSERS) {
    bodyParser.text({ type: contentType, limit: '1mb' })(req, res, async () => {
      // check for overQuota
      if (await overQuota(req)) {
        return next(HTTPError(413, 'User has exceeded their storage quota'))
      }
      // run the patch
      return execPatch(req, res, next)
    })
  } else {
    next(HTTPError(415, `Unsupported patch content type: ${contentType}`))
  }
}

async function execPatch (req, res, next) {
  const contentType = getContentType(req.headers)
  const parser = PATCH_PARSERS[contentType]

  if (req.body && req.body.length === 0) {
    debug('PATCH request with empty body')
    return next(HTTPError(400, 'PATCH request with empty body'))
  }

  debug(`Found parser for ${contentType}`)

  let baseURI
  let targetURI
  let ldp
  let path

  try {
    ldp = req.app.locals.ldp
    path = res.locals.path || req.path
    baseURI = ldp.resourceMapper.resolveUrl(req.hostname, req.path)
    targetURI = baseURI
  } catch (err) {
    debug('Could not parse request URL')
    return next(HTTPError(400, 'Could not parse request URL'))
  }

  withLock(targetURI, async () => {
    let graph
    let contentTypeFromResourceFileName
    const { stream, isContainer, foundAttempts } = await new Promise((resolve, reject) => {
      ldp.get(req, res, true, (err, stream, contentTypeFromResource) => {
        if (err && err.status === 404) {
          // File does not exist, create empty graph
          debug('PATCH -- target does not exist, creating empty graph')
          contentTypeFromResourceFileName = contentTypeForNew(req)
          const emptyGraph = $rdf.graph()
          resolve({
            stream: null,
            isContainer: false,
            foundAttempts: [],
            contentTypeFromResourceFileName
          })
        } else if (err) {
          reject(err)
        } else {
          resolve({
            stream,
            isContainer: false,
            foundAttempts: [],
            contentTypeFromResourceFileName: contentTypeFromResource
          })
        }
      })
    })

    if (isContainer) {
      debug('PATCH to container not allowed')
      return next(HTTPError(405, 'PATCH not allowed on containers'))
    }

    // check if created
    const isNewResource = !foundAttempts.includes(baseURI)
    debug(`PATCH -- isNewResource: ${isNewResource}`)

    // Parse the patch
    let patchObject
    try {
      patchObject = await parser.parse(targetURI, req.body, contentType)
    } catch (err) {
      debug(`PATCH -- Error parsing patch: ${err.message}`)
      return next(HTTPError(400, err.message))
    }

    if (!patchObject) {
      debug('PATCH -- Could not parse patch')
      return next(HTTPError(400, 'Could not parse patch'))
    }

    // Parse the current document
    if (!graph) {
      if (stream) {
        try {
          graph = await parseGraph(stream, targetURI, contentTypeFromResourceFileName)
        } catch (err) {
          debug(`PATCH -- Error parsing existing resource: ${err.message}`)
          return next(HTTPError(409, err.message))
        }
      } else {
        graph = $rdf.graph()
      }
    }

    // Apply the patch to the current document
    let patchedGraph
    try {
      patchedGraph = await patchObject.execute(graph.copy())
    } catch (err) {
      debug(`PATCH -- Error applying patch: ${err.message}`)
      return next(HTTPError(409, err.message))
    }

    // Serialize the patched document
    let serialized
    const writeContentType = contentTypeFromResourceFileName || contentType
    try {
      serialized = $rdf.serialize(undefined, patchedGraph, targetURI, writeContentType)
    } catch (err) {
      debug(`PATCH -- Error serializing: ${err.message}`)
      return next(HTTPError(500, 'Failed to serialize the result of PATCH'))
    }

    // Write the file
    try {
      const hash = crypto.createHash('md5').update(serialized).digest('hex')
      res.set('ETag', `"${hash}"`)
      const stream = Readable.from([serialized])

      await new Promise((resolve, reject) => {
        ldp.put(req, res, targetURI, writeContentType, stream, (err, result) => {
          if (err) {
            debug(`PATCH -- Error writing: ${err.message}`)
            return reject(HTTPError(err.status || 500, err.message))
          }
          resolve(result)
        })
      })

      debug('PATCH -- applied successfully')
      res.status(isNewResource ? 201 : 200)
      res.end()
      next()
    } catch (err) {
      debug(`PATCH -- Error: ${err.message}`)
      next(err)
    }
  })
}

async function parseGraph (stream, uri, contentType) {
  return new Promise((resolve, reject) => {
    const data = []
    stream.on('data', chunk => data.push(chunk))
    stream.on('end', () => {
      try {
        const graph = $rdf.graph()
        const content = Buffer.concat(data).toString()
        $rdf.parse(content, graph, uri, contentType)
        resolve(graph)
      } catch (err) {
        reject(err)
      }
    })
    stream.on('error', reject)
  })
}
