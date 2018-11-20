'use strict'

const AuthRequest = require('./auth-request')
const { actualSize } = require('../utils')
const { getFullUriFromRequest } = require('../common/uri-utils')
const $rdf = require('rdflib')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

class GetAccountInfoRequest extends AuthRequest {
  static async get (req, res) {
    const contentType = 'application/ld+json'
    const body = getBody(req, contentType)
    res
      .status(200)
      .set('Content-Type', contentType)
      .send(body)
  }
}

async function getBody (req, contentType) {
  const root = req.app.locals.ldp.getRoot(req.hostname)
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
