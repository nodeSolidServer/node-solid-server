import express from 'express'
import { linksHandler, addPermissions } from './header.mjs'
import allow from './handlers/allow.mjs'
import get from './handlers/get.mjs'
import post from './handlers/post.mjs'
import put from './handlers/put.mjs'
import del from './handlers/delete.mjs'
import patch from './handlers/patch.mjs'
import index from './handlers/index.js' // Keep as .js - not converted yet
import copy from './handlers/copy.mjs'
import notify from './handlers/notify.js' // Keep as .js - not converted yet

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

  return router
}