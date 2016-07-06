'use strict'
/**
 * @module capability-discovery
 */
const express = require('express')
const util = require('./utils')

const serviceConfigDefaults = {
  'api': {
    'accounts': {
      // 'changePassword': '/api/account/changePassword',
      // 'delete': '/api/accounts/delete',
      'new': '/api/accounts/new',
      'recover': '/api/accounts/recover',
      'signin': '/api/accounts/signin',
      'signout': '/api/accounts/signout',
      'validateToken': '/api/accounts/validateToken'
    }
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
  router.get('/.well-known/solid', serviceCapabilityDocument(serviceConfigDefaults))
  return router
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
    // Add the server root url
    serviceConfig.root = util.uriBase(req) // TODO make sure we align with the rest
    // Add the 'apps' urls section
    serviceConfig.apps = req.app.locals.appUrls
    res.json(serviceConfig)
  }
}
