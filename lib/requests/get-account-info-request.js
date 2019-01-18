'use strict'

const ACLChecker = require('../acl-checker')
const AuthRequest = require('./auth-request')
const { actualSize } = require('../utils')
const { getFullUriFromRequest } = require('../common/uri-utils')
const $rdf = require('rdflib')
const HTTPError = require('../http-error')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

class GetAccountInfoRequest extends AuthRequest {
  static async get (req, res) {
    const contentType = 'application/ld+json'
    const body = await getBody(req, contentType)
    if (body.status && body.status >= 400) {
      return res.status(body.status).send(body.message)
    }
    return res.status(200).set('Content-Type', contentType).send(body)
  }
}

async function getBody (req, contentType) {
  const ldp = req.app.locals.ldp
  const rootUrl = `${ldp.resourceMapper.resolveUrl(req.hostname)}/`
  const userId = req.session.userId
  if (!userId) {
    return new HTTPError(401, 'Requires authentication')
  }
  const acl = ACLChecker.createFromLDPAndRequest(rootUrl, ldp, req)
  const isAllowed = await acl.can(userId, 'Control')
  if (!isAllowed) {
    return await req.acl.getError(userId, 'Control')
  }
  const root = ldp.resourceMapper._getFullPath(rootUrl)
  const size = await actualSize(root)
  const store = $rdf.graph()
  const baseUri = getFullUriFromRequest(req)
  store.add($rdf.sym(baseUri), SOLID('storageUsage'), $rdf.lit(size))
  return await new Promise((resolve, reject) => {
    $rdf.serialize(null, store, baseUri, contentType, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
  })
}

module.exports = GetAccountInfoRequest
