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

function extendCors (req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'OPTIONS,HEAD,GET,PATCH,POST,PUT,DELETE')
  }
  next()
}

function LdpMiddleware (corsSettings) {
  var router = express.Router('/')

  // Add Link headers
  router.use(header.linksHandler)
  if (corsSettings) {
    router.use(corsSettings)
  }

  router.use('/*', authentication)
  router.get('/*', acl.allow('Read'), extendCors, index, get)
  router.post('/*', acl.allow('Append'), extendCors, post)
  router.patch('/*', acl.allow('Append'), extendCors, patch)
  router.put('/*', acl.allow('Write'), extendCors, put)
  router.delete('/*', acl.allow('Write'), extendCors, del)

  // Errors
  router.use(errorPages)

  // TODO: in the process of being deprecated
  // Convert json-ld and nquads to turtle
  // router.use('/*', parse.parseHandler)

  return router
}
