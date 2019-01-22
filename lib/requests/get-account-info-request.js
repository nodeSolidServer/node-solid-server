'use strict'

const ACLChecker = require('../acl-checker')
const AuthRequest = require('./auth-request')
const { actualSize } = require('../utils')
const $rdf = require('rdflib')
const HTTPError = require('../http-error')
const LRU = require('lru-cache')

const PIM = $rdf.Namespace('http://www.w3.org/ns/pim/space#')
const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

const cache = new LRU({
  max: 10000, // is this a reasonable amount to hold?
  length: (n, key) => {
    const keyType = typeof key
    let length = 1
    switch (keyType) {
      case 'object':
        length = Object.keys(key).length
        break
      case 'string':
        length = key.length
        break
    }
    return n * 2 + length
  },
  maxAge: 1000 * 60 * 60 // hold the value for one hour
})

class GetAccountInfoRequest extends AuthRequest {
  static async get (req, res) {
    const contentType = req.get('content-type') || 'text/turtle'
    const body = await getBody(req, contentType)
    if (body.status && body.status >= 400) {
      return res.status(body.status).send(body.message)
    }
    return res.status(200).set('Content-Type', contentType).send(body)
  }
}

async function getBody (req, contentType) {
  const userId = req.session.userId
  const cacheKey = `${userId}-${contentType}`
  if (!userId) {
    return new HTTPError(401, 'Requires authentication')
  }
  const cachedValue = cache.get(cacheKey)
  if (cachedValue) {
    return cachedValue
  }
  const ldp = req.app.locals.ldp
  const rootUrl = `${ldp.resourceMapper.resolveUrl(req.hostname)}/`
  const acl = ACLChecker.createFromLDPAndRequest(rootUrl, ldp, req)
  const isAllowed = await acl.can(userId, 'Control')
  if (!isAllowed) {
    return await req.acl.getError(userId, 'Control')
  }

  // Get total available size of user's POD
  const userIdGraph = await ldp.getGraph(userId)
  const storageUrlNode = userIdGraph.any($rdf.sym(userId), PIM('storage'), null)
  if (!storageUrlNode) {
    const storageNotFoundError = new HTTPError(404, 'Unable to find pim:storage for webId')
    cache.set(cacheKey, storageNotFoundError)
    return storageNotFoundError
  }
  const serverSideUrl = `${storageUrlNode.value}settings/serverSide.ttl` // needs to be hardcoded for now
  const serverSideGraph = await ldp.getGraph(serverSideUrl)
  const quotaNode = serverSideGraph.any(storageUrlNode, SOLID('storageQuota'), null)
  if (!quotaNode) {
    const quotaNotFoundError = new HTTPError(404, 'Unable to find solid:storageQuota')
    cache.set(quotaNotFoundError)
    return quotaNotFoundError
  }

  // Get size of user's POD
  const root = ldp.resourceMapper.getFullPath(rootUrl)
  const size = await actualSize(root)

  // Add triples to graph
  const store = $rdf.graph()
  store.add(storageUrlNode, SOLID('storageUsage'), $rdf.lit(size))
  store.add(storageUrlNode, SOLID('storageQuota'), quotaNode)
  return await new Promise((resolve, reject) => {
    $rdf.serialize(null, store, storageUrlNode.value, contentType, (err, result) => {
      if (err) {
        cache.set(cacheKey, err)
        return reject(err)
      }
      cache.set(cacheKey, result)
      resolve(result)
    })
  })
}

module.exports = GetAccountInfoRequest
