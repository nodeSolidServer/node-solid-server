// TODO: This is a CommonJS wrapper. Use ldp-middleware.mjs directly once ESM migration is complete.
module.exports = LdpMiddleware

const express = require('express')
const header = require('./header')
const allow = require('./handlers/allow')
const get = require('./handlers/get')
const post = require('./handlers/post')
const put = require('./handlers/put')
const del = require('./handlers/delete')
const patch = require('./handlers/patch')
const index = require('./handlers/index')
const copy = require('./handlers/copy')
const notify = require('./handlers/notify')

function LdpMiddleware (corsSettings, prep) {
  const router = express.Router('/')

  // Add Link headers
  router.use(header.linksHandler)

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.copy('/*', allow('Write'), copy)
  router.get('/*', index, allow('Read'), header.addPermissions, get)
  router.post('/*', allow('Append'), post)
  router.patch('/*', allow('Append'), patch)
  router.put('/*', allow('Append'), put)
  router.delete('/*', allow('Write'), del)

  if (prep) {
    router.post('/*', notify)
    router.patch('/*', notify)
    router.put('/*', notify)
    router.delete('/*', notify)
  }

  return router
}
