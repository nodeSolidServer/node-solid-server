module.exports = LdpMiddleware

var express = require('express')
var header = require('./header')
var acl = require('./acl')
var login = require('./login')
var get = require('./handlers/get')
var post = require('./handlers/post')
var put = require('./handlers/put')
var del = require('./handlers/delete')
var patch = require('./handlers/patch')
var index = require('./handlers/try-index')
var errorPages = require('./handlers/error-pages')

function LdpMiddleware (corsSettings) {
  var router = express.Router('/')

  // Add Link headers
  router.use(header.linksHandler)
  if (corsSettings) {
    router.use(corsSettings)
  }

  router.use('/*', login.loginHandler)
  router.get('/*', acl.allow('Read'), index, get)
  router.post('/*', acl.allow('Append'), post)
  router.patch('/*', acl.allow('Append'), patch)
  router.put('/*', acl.allow('Append'), put)
  router.delete('/*', acl.allow('Write'), del)

  // Errors
  router.use(errorPages)

  // TODO: in the process of being deprecated
  // Convert json-ld and nquads to turtle
  // router.use('/*', parse.parseHandler)

  return router
}
