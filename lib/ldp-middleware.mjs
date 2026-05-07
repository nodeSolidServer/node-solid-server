import express from 'express'
import { linksHandler, addPermissions } from './header.mjs'
import allow from './handlers/allow.mjs'
import get from './handlers/get.mjs'
import post from './handlers/post.mjs'
import put from './handlers/put.mjs'
import del from './handlers/delete.mjs'
import patch from './handlers/patch.mjs'
import index from './handlers/index.mjs'
import copy from './handlers/copy.mjs'
import notify from './handlers/notify.mjs'

export default function LdpMiddleware (corsSettings, prep) {
  const router = express.Router('/')
  const allResources = /.*/

  // Add Link headers
  router.use(linksHandler)

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.copy(allResources, allow('Write'), copy)
  router.get(allResources, index, allow('Read'), addPermissions, get)
  router.post(allResources, allow('Append'), post)
  router.patch(allResources, allow('Append'), patch)
  router.put(allResources, allow('Append'), put)
  router.delete(allResources, allow('Write'), del)

  if (prep) {
    router.post(allResources, notify)
    router.patch(allResources, notify)
    router.put(allResources, notify)
    router.delete(allResources, notify)
  }

  return router
}
