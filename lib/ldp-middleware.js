import express from 'express'
import { linksHandler, addPermissions } from './header.js'
import allow from './handlers/allow.js'
import get from './handlers/get.js'
import post from './handlers/post.js'
import put from './handlers/put.js'
import del from './handlers/delete.js'
import patch from './handlers/patch.js'
import index from './handlers/index.js'
import copy from './handlers/copy.js'
import notify from './handlers/notify.js'

export default function LdpMiddleware (corsSettings, prep) {
  const router = express.Router('/')

  // Add Link headers
  router.use(linksHandler)

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.copy('/*', allow('Write'), copy)
  router.get('/*', index, allow('Read'), addPermissions, get)
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
