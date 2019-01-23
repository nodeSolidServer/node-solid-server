'use strict'

const ACLChecker = require('../acl-checker')
const AuthRequest = require('./auth-request')
const { actualSize } = require('../utils')
const $rdf = require('rdflib')
const HTTPError = require('../http-error')

const PIM = $rdf.Namespace('http://www.w3.org/ns/pim/space#')
const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

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
  if (!userId) {
    return new HTTPError(401, 'Requires authentication')
  }
  const ldp = req.app.locals.ldp
  const rootUrl = `${ldp.resourceMapper.resolveUrl(req.hostname)}/`
  const acl = ACLChecker.createFromLDPAndRequest(rootUrl, ldp, req)
  const isAllowed = await acl.can(userId, 'Control')
  if (!isAllowed) {
    return await req.acl.getError(userId, 'Control')
  }

  // Dereference graph for webId
  let userIdGraph
  try {
    userIdGraph = await ldp.getGraph(userId)
  } catch (err) {
    return err
  }

  // Get object value for pim:storage
  const storageUrlNode = userIdGraph.any($rdf.sym(userId), PIM('storage'))
  if (!storageUrlNode) {
    return new HTTPError(404, 'Unable to find pim:storage for webId')
  }

  // Dereference graph for serverSide.ttl
  const serverSideUrl = `${storageUrlNode.value}settings/serverSide.ttl` // needs to be hardcoded for now
  let serverSideGraph
  try {
    serverSideGraph = await ldp.getGraph(serverSideUrl)
  } catch (err) {
    return err
  }

  // Get object value for solid:storageQuota
  const quotaNode = serverSideGraph.any(storageUrlNode, SOLID('storageQuota'), null)
  if (!quotaNode) {
    return new HTTPError(404, 'Unable to find solid:storageQuota')
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
        return reject(err)
      }
      resolve(result)
    })
  })
}

module.exports = GetAccountInfoRequest
