import Busboy from '@fastify/busboy'
import debugModule from 'debug'
const debug = debugModule('solid:post')
import path from 'path'
import * as header from '../header.mjs'
import patch from './patch.mjs'
import HTTPError from '../http-error.mjs'
import mime from 'mime-types'
import { getContentType } from '../utils.mjs'

export default async function handler (req, res, next) {
  const { extensions } = mime
  const ldp = req.app.locals.ldp
  const contentType = getContentType(req.headers)
  debug('content-type is ', contentType)
  // Handle SPARQL(-update?) query
  if (contentType === 'application/sparql' ||
      contentType === 'application/sparql-update') {
    debug('switching to sparql query')
    return patch(req, res, next)
  }

  // Handle container path
  let containerPath = req.path
  if (containerPath[containerPath.length - 1] !== '/') {
    containerPath += '/'
  }

  let hostUrl = req.hostname
  const ldpPath = res.locals.path || req.path

  // Handle file uploads from HTML form
  if (contentType === 'multipart/form-data') {
    debug('handling multipart/form-data')
    const isContainer = containerPath === req.path

    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 1
      }
    })

    let done
    const uploadComplete = new Promise((resolve, reject) => { done = { resolve, reject } })

    bb.on('file', function (fieldname, file, info) {
      const { filename, encoding, mimeType } = info
      debug('File [' + fieldname + ']: filename: %j, encoding: %j, mimeType: %j', filename, encoding, mimeType)

      // Generate file path
      const ext = path.extname(filename)
      const filenameWithoutExtension = path.basename(filename, ext)

      let resourcePath
      if (isContainer) {
        resourcePath = containerPath + encodeURIComponent(filename)
        hostUrl += resourcePath
      } else {
        // Append received filename to the posted slug
        resourcePath = req.path + '/' + encodeURIComponent(filename)
        hostUrl = hostUrl + resourcePath
      }

      ldp.put(req, res, hostUrl, mimeType, file, function (err, result) {
        if (err) {
          debug(err)
          file.resume()
          return done.reject(err)
        }
        debug('Upload successful')
        done.resolve({ resourcePath, result })
      })
    })

    bb.on('error', function (err) {
      debug('Upload error')
      done.reject(err)
    })

    req.pipe(bb)

    try {
      const { resourcePath } = await uploadComplete
      // Set the created path for the response
      res.locals.path = resourcePath
      res.status(201)
      if (req.headers.link === '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"') {
        res.header('Location', resourcePath + '/')
        res.header('MS-Author-Via', 'SPARQL')
      } else {
        res.header('Location', resourcePath)
        res.header('MS-Author-Via', 'SPARQL')
      }
      res.end()
      return next()
    } catch (err) {
      return next(HTTPError(err.status || 500, err.message))
    }
  }

  // Handle everything else through the normal mechanism
  return ldp.post(req, res, next)
}