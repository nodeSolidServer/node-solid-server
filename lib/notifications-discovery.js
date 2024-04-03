'use strict'
/**
 * @module capability-discovery
 */
const express = require('express')
const { URL } = require('url')

module.exports = capabilityDiscovery

/**
 * Returns a set of routes to deal with server capability discovery
 * @method capabilityDiscovery
 * @return {Router} Express router
 */
function capabilityDiscovery () {
  const router = express.Router('/')

  // Advertise the server capability discover endpoint
  router.get('/.well-known/solid', serviceCapabilityDocument())
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
function serviceCapabilityDocument () {
  return (req, res) => {
    const ldp = req.app.locals.ldp
    res.json({
      // Add the server root url
      root: ldp.resourceMapper.resolveUrl(req.hostname, req.path),
      // Add the 'apps' urls section
      apps: req.app.locals.appUrls,
      api: {
        accounts: {
          // 'changePassword': '/api/account/changePassword',
          // 'delete': '/api/accounts/delete',

          // Create new user (see IdentityProvider.post() in identity-provider.js)
          new: new URL('/api/accounts/new', ldp.serverUri),
          recover: new URL('/api/accounts/recover', ldp.serverUri),
          signin: ldp.resourceMapper.resolveUrl(req.hostname, '/login'),
          signout: ldp.resourceMapper.resolveUrl(req.hostname, '/logout'),
          validateToken: new URL('/api/accounts/validateToken', ldp.serverUri)
        }
      }
    })
  }
}
