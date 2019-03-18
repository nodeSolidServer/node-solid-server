module.exports = handler

const debug = require('../debug')
const error = require('../http-error')
const ldpCopy = require('../ldp-copy')
const url = require('url')

/**
 * Handles HTTP COPY requests to import a given resource (specified in the
 * `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth delegation
 * is implemented), and is mainly intended for use with
 * "Save an external resource to Solid" type apps.
 * @method handler
 */
async function handler (req, res, next) {
  const copyFrom = req.header('Source')
  if (!copyFrom) {
    return next(error(400, 'Source header required'))
  }
  const fromExternal = !!url.parse(copyFrom).hostname
  const ldp = req.app.locals.ldp
  const serverRoot = ldp.resourceMapper.resolveUrl(req.hostname)
  const copyFromUrl = fromExternal ? copyFrom : serverRoot + copyFrom
  const copyToUrl = res.locals.path || req.path
  try {
    await ldpCopy(ldp.resourceMapper, copyToUrl, copyFromUrl)
  } catch (err) {
    let statusCode = err.statusCode || 500
    let errorMessage = err.statusMessage || err.message
    debug.handlers('Error with COPY request:' + errorMessage)
    return next(error(statusCode, errorMessage))
  }
  res.set('Location', copyToUrl)
  res.sendStatus(201)
  next()
}
