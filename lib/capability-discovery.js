'use strict'
/**
 * @module capability-discovery
 */
const express = require('express')
const addLink = require('./header').addLink
const util = require('./utils')

const serviceConfig = {
  'api': {
    'account.changepassword': '/api/account/changepassword',
    'account.delete': '/api/account/delete',
    'account.new': '/api/account/new',
    'account.recover': '/api/account/recover',
    'account.signin': '/api/account/signin',
    'account.signout': '/api/account/signout'
  }
}

module.exports = capabilityDiscovery

/**
 * Returns a set of routes to deal with server capability discovery
 * @method capabilityDiscovery
 * @return {Router} Express router
 */
function capabilityDiscovery () {
  var router = express.Router('/')

  // Advertise the server capability discover endpoint
  router.options('*', serviceEndpointHeader)
  router.get('/.well-known/solid', serviceCapabilityDocument(serviceConfig))
  return router
}

/**
 * Handles advertising the server capability endpoint (adds a Link Relation
 * header of type `service`, points to the capability document).
 * To be used with OPTIONS requests.
 * @method serviceEndpointHeader
 * @param req
 * @param res
 * @param next
 */
function serviceEndpointHeader (req, res, next) {
  let serviceEndpoint = `${util.uriBase(req)}/.well-known/solid`
  addLink(res, serviceEndpoint, 'service')
  next()
}

/**
 * Serves the service capability document (containing server root URL, including
 * any base path the user specified in config, server API endpoints, etc).
 * @method serviceCapabilityDocument
 * @param req
 * @param res
 * @param next
 */
function serviceCapabilityDocument (serviceConfig) {
  return (req, res, next) => {
    serviceConfig.root = util.uriBase(req)
    res.json(serviceConfig)
  }
}
