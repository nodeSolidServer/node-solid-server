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

  // Check if container exists
  let stats
  try {
    const ret = await ldp.exists(req.hostname, containerPath, false)
    if (ret) stats = ret.stream
  } catch (err) {
    return next(HTTPError(err, 'Container not valid'))
  }

  // Check if container is a directory
  if (stats && !stats.isDirectory()) {
    debug('Path is not a container, 405!')
    return next(HTTPError(405, 'Requested resource is not a container'))
  }

  // Dispatch to the right handler
  if (req.is('multipart/form-data')) {
    multi()
  } else {
    one()
  }

  function multi () {
    debug('receving multiple files')

    const busboy = new Busboy({ headers: req.headers })
    busboy.on('file', async function (fieldname, file, filename, encoding, mimetype) {
      debug('One file received via multipart: ' + filename)
      const { url: putUrl } = await ldp.resourceMapper.mapFileToUrl(
        { path: ldp.resourceMapper._rootPath + path.join(containerPath, filename), hostname: req.hostname })
      try {
        await ldp.put(putUrl, file, mimetype)
      } catch (err) {
        busboy.emit('error', err)
      }
    })
    busboy.on('error', function (err) {
      debug('Error receiving the file: ' + err.message)
      next(HTTPError(500, 'Error receiving the file'))
    })

    // Handled by backpressure of streams!
    busboy.on('finish', function () {
      debug('Done storing files')
      res.sendStatus(200)
      next()
    })
    req.pipe(busboy)
  }

  function one () {
    debug('Receving one file')
    const { slug, link, 'content-type': contentType } = req.headers
    const links = header.parseMetadataFromHeader(link)
    const mimeType = contentType ? contentType.replace(/\s*;.*/, '') : ''
    const extension = mimeType in extensions ? `.${extensions[mimeType][0]}` : ''
    debug('slug '+ slug)
    debug('extension '+ extension)
    debug('containerPath '+ containerPath)
    debug('contentType '+ contentType)
    debug('links '+ JSON.stringify(links))
    ldp.post(req.hostname, containerPath, req,
      { slug, extension, container: links.isBasicContainer, contentType }).then(
      resourcePath => {
        debug('File stored in ' + resourcePath)
        header.addLinks(res, links)
        res.set('Location', resourcePath)
        res.sendStatus(201)
        next()
      },
      err => next(err))
  }
}