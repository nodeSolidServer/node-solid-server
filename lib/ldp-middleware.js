module.exports = LdpMiddleware

var express = require('express')
var header = require('./header')
var acl = require('./handlers/allow')
var get = require('./handlers/get')
var post = require('./handlers/post')
var put = require('./handlers/put')
var del = require('./handlers/delete')
var patch = require('./handlers/patch')
var index = require('./handlers/index')
var copy = require('./handlers/copy')

function LdpMiddleware (corsSettings) {
  var router = express.Router('/')

  // Add Link headers
  router.use(header.linksHandler)

  // TODO edit cors
  // router.use((req, res, next) => {
  // edit cors according to ACL
  // })
  if (corsSettings) {
    router.use(corsSettings)
  }

  router.copy('/*', acl.allow('Write'), copy)
  router.get('/*', index, acl.allow('Read'), get)
  router.post('/*', acl.allow('Append'), post)
  router.patch('/*', acl.allow('Write'), patch)
  router.put('/*', acl.allow('Write'), put)
  router.delete('/*', acl.allow('Write'), del)

  return router
}
