module.exports = LdpMiddleware

var express = require('express')
var header = require('./header')
var acl = require('./acl')
var authentication = require('./handlers/authentication')
var get = require('./handlers/get')
var post = require('./handlers/post')
var put = require('./handlers/put')
var del = require('./handlers/delete')
var patch = require('./handlers/patch')
var index = require('./handlers/index')
var errorPages = require('./handlers/error-pages')

function LdpMiddleware (corsSettings) {
  var router = express.Router('/')

  // Add Link headers
  router.use(header.linksHandler)
  if (corsSettings) {
    router.use(corsSettings)
  }

  router.get('/*', index, allow('Read'), get)
  router.post('/*', allow('Append'), post)
  router.patch('/*', allow('Append'), patch)
  router.put('/*', allow('Write'), put)
  router.delete('/*', allow('Write'), del)

  // Errors
  router.use(errorPages)

  // TODO: in the process of being deprecated
  // Convert json-ld and nquads to turtle
  // router.use('/*', parse.parseHandler)

  return router
}

// Check the ACL without asking the user to login
// If the ACL doesn't pass, renegotiate the connection
// asking for a WebID+TLS certificate
function allow (accessType) {
  return function (req, res, next) {
    acl.allow(accessType)(req, res, function (err) {
      if (err) {
        // Auth not successful, needs user auth
        // Renegotiate the connection
        authentication(req, res, function (err) {
          if (err) {
            return next(err)
          }
          acl.allow(accessType)(req, res, next)
        })
      } else {
        next()
      }
    })
  }
}
