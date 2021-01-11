'use strict'
/**
 * @module payment-pointer-discovery
 */
const express = require('express')

module.exports = paymentPointerDiscovery

/**
 * Returns a set of routes to deal with server payment pointer discovery
 * @method paymentPointerDiscovery
 * @return {Router} Express router
 */
function paymentPointerDiscovery () {
  const router = express.Router('/')

  // Advertise the server payment pointer discover endpoint
  router.get('/.well-known/pay', paymentPointerDocument())
  return router
}

/**
 * Serves the service payment pointer document (containing server root URL, including
 * any base path the user specified in config, server API endpoints, etc).
 * @method paymentPointerDocument
 * @param req
 * @param res
 * @param next
 */
function paymentPointerDocument () {
  return (req, res) => {
    res.json({
      hello: 'world'
    })
  }
}
