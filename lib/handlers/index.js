module.exports = handler

var path = require('path')
var debug = require('debug')('ldnode:index')
var acl = require('../acl')
var get = require('./get')
var utils = require('../utils')
var Negotiator = require('negotiator')

function handler (req, res, next) {
  var indexFile = 'index.html'
  var ldp = req.app.locals.ldp
  var negotiator = new Negotiator(req)
  var requestedType = negotiator.mediaType()
  var filename = utils.reqToPath(req)

  if (requestedType.indexOf('text/html') !== 0) {
    return next()
  }

  ldp.stat(filename, function (err, stats) {
    if (err) return next()

    res.locals.path = req.path
    if (stats.isDirectory()) {
      res.locals.path = path.join(req.path, indexFile)
    }
    debug('Looking for index in ' + res.locals.path)

    // Check if file exists in first place
    ldp.exists(req.hostname, res.locals.path, function (err) {
      if (err) {
        res.locals.path = req.path
        return next()
      }
      debug('Found an index for current path')
      // Since it exists, can the user read this?
      acl.allow('Read')(req, res, function (err) {
        if (err) {
          res.locals.path = req.path
          return next()
        }
        debug('current agent can read it')
        // Send the file
        get(req, res, function (err) {
          if (err) return next()
          // file is already sent, no action needed
        })
      })
    })
  })
}
