/* eslint-disable no-mixed-operators, no-async-promise-executor */

import fs from 'fs'
import glob from 'glob'
import _path from 'path'
import $rdf from 'rdflib'
import Negotiator from 'negotiator'
import mime from 'mime-types'

import debugModule from 'debug'
const debug = debugModule('solid:get')
const debugGlob = debugModule('solid:glob')
import allow from './allow.mjs'

import { translate } from '../utils.mjs'
import HTTPError from '../http-error.mjs'

import ldpModule from '../ldp.js'
const { mimeTypesAsArray, mimeTypeIsRdf } = ldpModule
const RDFs = mimeTypesAsArray()
const isRdf = mimeTypeIsRdf

const prepConfig = 'accept=("message/rfc822" "application/ld+json" "text/turtle")'

export default async function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  const prep = req.app.locals.prep
  const includeBody = req.method === 'GET'
  const negotiator = new Negotiator(req)
  const baseUri = ldp.resourceMapper.resolveUrl(req.hostname, req.path)
  const path = res.locals.path || req.path
  const requestedType = negotiator.mediaType()
  const possibleRDFType = negotiator.mediaType(RDFs)

  // deprecated kept for compatibility
  res.header('MS-Author-Via', 'SPARQL')

  res.header('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
  res.header('Accept-Post', '*/*')
  if (!path.endsWith('/') && !glob.hasMagic(path)) res.header('Accept-Put', '*/*')

  // Set live updates
  if (prep && req.method === 'GET') {
    res.header('Updates-Via', res.locals.updatesVia)
    const filePath = res.locals.path
    debug(req.originalUrl + ' on ' + req.hostname)
    if (filePath) {
      res.header('Link', `<${filePath}>; rel="prep:file-path", <${prepConfig}>; rel="prep:config"`)
    }
  }

  // Handle path with glob
  if (glob.hasMagic(path)) {
    debug('forwarding to glob request')
    try {
      return await glob2RDF(req, res, next)
    } catch (err) {
      err.status = err.status || 500
      err.message = err.message || 'Unknown error'
      debug(req.method + ' -- Error: ' + err.status + ' ' + err.message)
      return next(err)
    }
  }

  ldp.get(req, res, includeBody, async function (err, stream, contentType) {
    // handle errors
    if (err) {
      err.status = err.status || 500
      err.message = err.message || 'Unknown error'
      debug(req.method + ' -- Error: ' + err.status + ' ' + err.message)
      return next(err)
    }

    // Till here it was always the LDP get

    // Handle HEAD requests
    if (!includeBody) {
      debug('HEAD only')
      return allow('Read').handlePermissions(req, res, next)
    }

    // redirect to the index
    if (req.path.slice(-1) === '/' && req.accepts('text/html')) {
      debug('Looking for index files')
      ldp.getIndex(req, res, next, requestedType)
      return
    }

    // set headers
    const Lightbox = path.slice(-1) === '/'
    if (Lightbox) {
      res.links({
        type: 'http://www.w3.org/ns/ldp#Container',
        meta: res.locals.metadataFile
      })
    }
    res.header('Content-Type', contentType)

    // Set ACL and Meta Link headers
    if (req.method === 'GET' && !_path.basename(req.path).endsWith('.acl') && !_path.basename(req.path).endsWith('.meta')) {
      ldp.addHeaders(res, req)
    }

    // Redirect to data browser for HTML content type
    if (ldp.dataBrowser && requestedType === 'text/html') {
      const dataBrowserPath = _path.join(ldp.dataBrowser, 'browse.html')
      debug('   sending data browser file: ' + dataBrowserPath)
      res.sendFile(dataBrowserPath)
      return
    }

    // Handle request for RDF content types
    if (possibleRDFType) {
      // Handle non-RDF to RDF conversion
      if (!isRdf(contentType)) {
        // If content type requested is not RDF, return 415
        if (!possibleRDFType || possibleRDFType === '*/*') {
          debug('Non-RDF resource: ' + req.originalUrl + ' ' + contentType)
          // If the client can also accept the original content type, return as-is
          if (negotiator.mediaType([contentType, '*/*'])) {
            debug('   client accepts original content type')
            stream.pipe(res)
            return allow('Read').handlePermissions(req, res, next)
          } else {
            // The client cannot accept the original type, return 415
            return next(HTTPError(415, 'Unsupported Media Type'))
          }
        } else {
          try {
            // Translate from the contentType found to the possibleRDFType desired
            const data = await translate(stream, baseUri, contentType, possibleRDFType)
            debug(req.originalUrl + ' translating ' + contentType + ' -> ' + possibleRDFType)
            res.header('Content-Type', possibleRDFType)

            const Readable = require('stream').Readable
            const readable = new Readable()
            readable.push(data)
            readable.push(null)
            readable.pipe(res)
            return allow('Read').handlePermissions(req, res, next)
          } catch (err) {
            debug('error translating: ' + req.originalUrl + ' ' + contentType + ' -> ' + possibleRDFType + ' -- ' + 406 + ' ' + err.message)
            return next(HTTPError(406, 'Cannot translate to requested type ' + possibleRDFType))
          }
        }
      }

      // Handle RDF to RDF conversion
      if (possibleRDFType && isRdf(contentType) && possibleRDFType !== contentType && possibleRDFType !== '*/*') {
        // If it is not in our RDFs we can't even translate,
        // Sorry, we can't help
        if (RDFs.indexOf(possibleRDFType) < 0) {
          return next(HTTPError(406, 'Cannot serve requested type: ' + contentType))
        }

        // Translate from the contentType found to the possibleRDFType desired
        try {
          const data = await translate(stream, baseUri, contentType, possibleRDFType)
          debug(req.originalUrl + ' translating ' + contentType + ' -> ' + possibleRDFType)
          res.header('Content-Type', possibleRDFType)

          const Readable = require('stream').Readable
          const readable = new Readable()
          readable.push(data)
          readable.push(null)
          readable.pipe(res)
          return allow('Read').handlePermissions(req, res, next)
        } catch (err) {
          err.status = err.status || 406
          err.message = err.message || ('Cannot translate ' + contentType + ' to ' + possibleRDFType)
          debug('error translating: ' + req.originalUrl + ' ' + contentType + ' -> ' + possibleRDFType + ' -- ' + 406 + ' ' + err.message)
          return next(err)
        }
      }
    } else {
      // Check if client can accept the content type found on disk
      if (negotiator.mediaType([contentType, '*/*'])) {
        // set content-type only if we found it on disk
        res.header('Content-Type', contentType)
        stream.pipe(res)
        return allow('Read').handlePermissions(req, res, next)
      } else {
        return next(HTTPError(406, 'Cannot serve requested type'))
      }
    }

    // The contentType stored is exactly the possibleRDFType desired
    // and is RDF, so just return what was found
    stream.pipe(res)
    return allow('Read').handlePermissions(req, res, next)
  })
}

// Glob request
async function glob2RDF (req, res, next) {
  const ldp = req.app.locals.ldp
  const requestedType = new Negotiator(req).mediaType()

  // set header
  if (req.path.slice(-1) === '/') {
    res.links({
      type: 'http://www.w3.org/ns/ldp#Container'
    })
  }

  // Handle requested content types
  try {
    const globRes = await ldpGlob(req)
    res.header('Content-Type', 'text/turtle')

    if (requestedType === 'application/ld+json') {
      const data = await translate(globRes, req.uri, 'text/turtle', 'application/ld+json')
      res.header('Content-Type', 'application/ld+json')
      res.send(data)
      return allow('Read').handlePermissions(req, res, next)
    }

    res.send(globRes)
    return allow('Read').handlePermissions(req, res, next)
  } catch (err) {
    debug('Error with glob request:' + err.message)
    return next(err)
  }
}

async function ldpGlob (req) {
  const ldp = req.app.locals.ldp
  const hostname = req.hostname
  const globPath = req.path
  const uri = ldp.resourceMapper.resolveUrl(hostname).slice(0, -1)
  debugGlob('BASE URI', uri)

  return new Promise((resolve, reject) => {
    const filename = ldp.resourceMapper.resolveFilePath(hostname, globPath, req.headers.host)
    debugGlob('Filename: ', filename)

    glob(filename, { mark: true }, async function (err, files) {
      if (err) return reject(err)

      const globGraph = $rdf.graph()

      debugGlob('found matches', files.length)
      for (let i = 0; i < files.length; i++) {
        const match = files[i]
        debugGlob('Match', i, match)

        try {
          // TODO: convert this to not use callbacks
          const { path, contentType } = await new Promise((res2, rej2) => {
            ldp.resourceMapper.mapFileToUrl(match, hostname, (err2, path2, contentType2) => {
              if (err2) return rej2(err2)
              res2({ path: path2, contentType: contentType2 })
            })
          })

          debugGlob('PathFromMatch', i, path)
          debugGlob('contentType', contentType)

          if (path) {
            const fullUrl = uri + path
            const fullUrlSym = globGraph.sym(fullUrl)

            if (match.endsWith('/')) {
              globGraph.add(
                globGraph.sym(uri + globPath),
                globGraph.sym('http://www.w3.org/ns/ldp#contains'),
                fullUrlSym)

              globGraph.add(
                fullUrlSym,
                globGraph.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                globGraph.sym('http://www.w3.org/ns/ldp#Container'))

              globGraph.add(
                fullUrlSym,
                globGraph.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                globGraph.sym('http://www.w3.org/ns/ldp#Resource'))
            } else {
              globGraph.add(
                globGraph.sym(uri + globPath),
                globGraph.sym('http://www.w3.org/ns/ldp#contains'),
                fullUrlSym)

              globGraph.add(
                fullUrlSym,
                globGraph.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                globGraph.sym('http://www.w3.org/ns/ldp#Resource'))

              globGraph.add(
                fullUrlSym,
                globGraph.sym('http://purl.org/dc/terms/modified'),
                $rdf.lit(new Date(fs.lstatSync(match).mtime).toISOString(), $rdf.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')))
            }

            if (contentType) {
              let mimeType = mime.lookup(contentType)
              if (!mimeType) mimeType = contentType

              globGraph.add(
                fullUrlSym,
                globGraph.sym('http://www.w3.org/ns/iana/media-types/mediaType'),
                $rdf.lit(mimeType))
            }
          }
        } catch (err) {
          return reject(err)
        }
      }

      const globResult = $rdf.serialize(undefined, globGraph, uri + globPath, 'text/turtle')
      resolve(globResult)
    })
  })
}