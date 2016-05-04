module.exports = handler

var path = require('path')
var debug = require('debug')('solid:index')
var utils = require('../utils')
var Negotiator = require('negotiator')

function handler (req, res, next) {
  var indexFile = 'index.html'
  var ldp = req.app.locals.ldp
  var negotiator = new Negotiator(req)
  var requestedType = negotiator.mediaType()
  var filename = utils.reqToPath(req)

  ldp.stat(filename, function (err, stats) {
    if (err) return next()

    if (!stats.isDirectory()) {
      return next()
    }
    // redirect to the right container if missing trailing /
    if (req.path.lastIndexOf('/') !== req.path.length - 1) {
      return res.redirect(301, path.join(req.path, '/'))
    }

    if (requestedType && requestedType.indexOf('text/html') !== 0) {
      return next()
    }
    debug('Looking for index in ' + req.path)

    // Check if file exists in first place
    ldp.exists(req.hostname, path.join(req.path, indexFile), function (err) {
      if (err) {
        return next()
      }
      res.locals.path = path.join(req.path, indexFile)
      debug('Found an index for current path')
      return next()
    })
  })
}
