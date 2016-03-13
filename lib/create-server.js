module.exports = createServer

var express = require('express')
var fs = require('fs')
var https = require('https')
var http = require('http')
var SolidWs = require('solid-ws')
var debug = require('./debug')
var createApp = require('./create-app')

function createServer (argv) {
  argv = argv || {}
  var app = express()
  var ldpApp = createApp(argv)
  var ldp = ldpApp.locals.ldp
  var mount = argv.mount || '/'
  // Removing ending '/'
  if (mount.length > 1 &&
    mount[mount.length - 1] === '/') {
    mount = mount.slice(0, -1)
  }
  app.use(mount, ldpApp)
  debug.settings('Base URL (--mount): ' + mount)
  var server = http.createServer(app)

  if (ldp && (ldp.webid || ldp.idp || argv.key || argv.cert)) {
    debug.settings('SSL Private Key path: ' + argv.key)
    debug.settings('SSL Certificate path: ' + argv.cert)

    if (!argv.cert && !argv.key) {
      throw new Error('Missing SSL cert and SSL key to enable WebIDs')
    }

    if (!argv.key && argv.cert) {
      throw new Error('Missing path for SSL key')
    }

    if (!argv.cert && argv.key) {
      throw new Error('Missing path for SSL cert')
    }

    var key
    try {
      key = fs.readFileSync(argv.key)
    } catch (e) {
      throw new Error('Can\'t find SSL key in ' + argv.key)
    }

    var cert
    try {
      cert = fs.readFileSync(argv.cert)
    } catch (e) {
      throw new Error('Can\'t find SSL cert in ' + argv.cert)
    }

    var credentials = {
      key: key,
      cert: cert,
      requestCert: true
    }

    server = https.createServer(credentials, app)
  }

  // Setup Express app
  if (ldp.live) {
    var solidWs = SolidWs(server, ldpApp)
    ldpApp.locals.ldp.live = solidWs.publish.bind(solidWs)
  }

  return server
}
