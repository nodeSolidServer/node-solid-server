const addLink = require('../header').addLink
const utils = require('../utils')

module.exports = handler

function handler (req, res, next) {
  let serviceEndpoint = `${utils.uriBase(req)}/.well-known/solid`
  addLink(res, serviceEndpoint, 'service')
  res.header('Accept-Patch', 'application/sparql-update')
  next()
}
