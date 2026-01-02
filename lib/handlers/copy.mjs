import debug from '../debug.mjs'
import HTTPError from '../http-error.mjs'
import ldpCopy from '../ldp-copy.mjs'
import { parse } from 'url'

/**
 * Handles HTTP COPY requests to import a given resource (specified in the
 * `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth delegation
 * is implemented), and is mainly intended for use with
 * "Save an external resource to Solid" type apps.
 * @method handler
 */
export default async function handler (req, res, next) {
  const copyFrom = req.header('Source')
  if (!copyFrom) {
    return next(HTTPError(400, 'Source header required'))
  }
  const fromExternal = !!parse(copyFrom).hostname
  const ldp = req.app.locals.ldp
  const serverRoot = ldp.resourceMapper.resolveUrl(req.hostname)
  const copyFromUrl = fromExternal ? copyFrom : serverRoot + copyFrom
  const copyToUrl = res.locals.path || req.path
  try {
    await ldpCopy(ldp.resourceMapper, copyToUrl, copyFromUrl)
  } catch (err) {
    const statusCode = err.statusCode || 500
    const errorMessage = err.statusMessage || err.message
    debug.handlers('Error with COPY request:' + errorMessage)
    return next(HTTPError(statusCode, errorMessage))
  }
  res.set('Location', copyToUrl)
  res.sendStatus(201)
  next()
}
