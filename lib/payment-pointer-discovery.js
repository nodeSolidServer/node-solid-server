'use strict'
/**
 * @module payment-pointer-discovery
 */
const express = require('express')
const { promisify } = require('util')
const fs = require('fs')

module.exports = paymentPointerDiscovery

const SETTING_FILE_PATH = '/settings/paymentPointer.json'

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
      const url = ldp.resourceMapper.resolveUrl(req.hostname, SETTING_FILE_PATH)
      const contentType = 'application/json'
      const createIfNotExists = true
      const { path } = await ldp.resourceMapper.mapUrlToFile({ url, contentType, createIfNotExists })
      let body
      try {
        // Read the file from disk
        body = await promisify(fs.readFile)(path, { encoding: 'utf8' })
      } catch (e) {
        if (e.message.startsWith('ENOENT: no such file or directory,')) {
          res.json({
            error: `Please create ${SETTING_FILE_PATH} on your pod`
          })
        }
      }
      let obj
      try {
        // Read the file from disk
        obj = JSON.parse(body)
      } catch (e) {
        res.json({
          error: `Please make sure ${SETTING_FILE_PATH} contains valid JSON`
        })
      }
      res.json(obj)
    } catch (e) {
      res.json({ fail: e.message })
    }
  }
}
