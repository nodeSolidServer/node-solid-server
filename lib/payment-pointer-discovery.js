'use strict'
/**
 * @module payment-pointer-discovery
 */
const express = require('express')
const { promisify } = require('util')
const fs = require('fs')
const rdf = require('rdflib')

module.exports = paymentPointerDiscovery

const PROFILE_PATH = '/profile/card'

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
  return async (req, res) => {
    try {
      const ldp = req.app.locals.ldp
      const url = ldp.resourceMapper.resolveUrl(req.hostname, PROFILE_PATH)
      const contentType = 'text/turtle'
      const createIfNotExists = false
      const { path } = await ldp.resourceMapper.mapUrlToFile({ url, contentType, createIfNotExists })
      let body
      try {
        // Read the file from disk
        body = await promisify(fs.readFile)(path, { encoding: 'utf8' })
      } catch (e) {
        if (e.message.startsWith('ENOENT: no such file or directory,')) {
          res.json({
            error: `Please create ${PROFILE_PATH} on your pod`
          })
        }
      }
      const webid = rdf.Namespace(`${url}#`)('me')
      const pp = rdf.Namespace('http://paymentpointers.org/ns#')('PaymentPointer')
      let paymentPointer
      try {
        const graph = rdf.graph()
        // Parse the file as Turtle
        rdf.parse(body, graph, url, contentType)
        paymentPointer = graph.any(webid, pp)
      } catch (e) {
        console.error(e)
        res.json({
          error: `Please make sure ${PROFILE_PATH} contains valid Turtle`
        })
      }
      if (paymentPointer === null) {
        res.json({ fail: 'Add triple', subject: `<${webid.value}>`, predicate: `<${pp.value}>`, object: '$alice.example' })
      }
      if (paymentPointer.value.startsWith('$')) {
        let suffix = ''
        if (paymentPointer.value.indexOf('/') === -1) {
          suffix = '/.well-known/pay'
        }
        paymentPointer.value = `https://${paymentPointer.value.substring(1)}${suffix}`
      }
      res.redirect(paymentPointer.value)
    } catch (e) {
      res.json({ fail: e.message })
    }
  }
}
