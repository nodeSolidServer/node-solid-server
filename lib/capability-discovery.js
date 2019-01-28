'use strict'
/**
 * @module capability-discovery
 */
const express = require('express')
const restrictToTopDomain = require('./handlers/restrict-to-top-domain')

const serviceConfigDefaults = {
  'api': {
    'accounts': {
      // 'changePassword': '/api/account/changePassword',
      // 'delete': '/api/accounts/delete',

      // Create new user (see IdentityProvider.post() in identity-provider.js)
      'new': '/api/accounts/new',
      'recover': '/api/accounts/recover',
      'signin': '/login',
      'signout': '/logout',
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
  const router = express.Router('/')

  // Advertise the server capability discover endpoint
  router.get('/.well-known/solid', restrictToTopDomain, serviceCapabilityDocument(serviceConfigDefaults))
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
  return (req, res) => {
    // Add the server root url
    serviceConfig.root = req.app.locals.ldp.resourceMapper.resolveUrl(req.hostname, req.path)
    // Add the 'apps' urls section
    serviceConfig.apps = req.app.locals.appUrls
    res.json(serviceConfig)
  }
}
