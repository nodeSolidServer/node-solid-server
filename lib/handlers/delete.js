module.exports = handler

var debug = require('../debug').handlers

function handler (req, res, next) {
  debug('DELETE -- Request on' + req.originalUrl)

  var ldp = req.app.locals.ldp
  ldp.delete(req.hostname, req.path, function (err) {
    if (err) {
      debug('DELETE -- Failed to delete: ' + err)
      return next(err)
    }
    debug('DELETE -- Ok.')
    res.sendStatus(200)
    return next()
  })
}
