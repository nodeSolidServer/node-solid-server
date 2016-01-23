module.exports = handler

var path = require('path')
var debug = require('debug')('ldnode:index')
var acl = require('../acl')
var get = require('./get')
var Negotiator = require('negotiator')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var negotiator = new Negotiator(req)
  var requestedType = negotiator.mediaType()

  if (requestedType.indexOf('text/html') !== 0) {
    return next()
  }

  res.locals.path = path.join(req.path, 'index.html')

  debug('looking for ' + res.locals.path)
  // Check if file exists in first place
  ldp.exists(req.hostname, res.locals.path, function (err) {
    if (err) return next()
    debug('found an index for current path')
    // Since it exists, can the user read this?
    acl.allow('Read')(req, res, function (err) {
      if (err) return next()
      debug('current agent can read it')
      // Send the file
      get(req, res, function (err) {
        if (err) return next()
        debug('defaulting to index.html')
        // file is already sent, no action needed
      })
    })
  })
}
