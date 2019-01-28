const HTTPError = require('../http-error')

module.exports = function (req, res, next) {
  const locals = req.app.locals
  const ldp = locals.ldp
  const serverUri = locals.host.serverUri
  const hostname = ldp.resourceMapper.resolveUrl(req.hostname)
  if (hostname === serverUri) {
    return next()
  }
  return next(new HTTPError(403, 'Not allowed to access top-level APIs on accounts'))
}
