module.exports = createServer

var express = require('express')
var fs = require('fs')
var https = require('https')
var http = require('http')
var SolidWs = require('solid-ws')
var debug = require('./debug')
var createApp = require('./create-app')

function createServer (argv, app) {
  argv = argv || {}
  app = app || express()
  var ldpApp = createApp(argv)
  var ldp = ldpApp.locals.ldp || {}
  var mount = argv.mount || '/'
  // Removing ending '/'
  if (mount.length > 1 &&
    mount[mount.length - 1] === '/') {
    mount = mount.slice(0, -1)
  }
  app.use(mount, ldpApp)
  debug.settings('Base URL (--mount): ' + mount)

  var server
  var needsTLS = argv.sslKey || argv.sslCert ||
                 (ldp.webid || ldp.idp) && !argv.acceptCertificateHeader
  if (!needsTLS) {
    server = http.createServer(app)
  } else {
    debug.settings('SSL Private Key path: ' + argv.sslKey)
    debug.settings('SSL Certificate path: ' + argv.sslCert)

    if (!argv.sslCert && !argv.sslKey) {
      throw new Error('Missing SSL cert and SSL key to enable WebIDs')
    }

    if (!argv.sslKey && argv.sslCert) {
      throw new Error('Missing path for SSL key')
    }

    if (!argv.sslCert && argv.sslKey) {
      throw new Error('Missing path for SSL cert')
    }

    var key
    try {
      key = fs.readFileSync(argv.sslKey)
    } catch (e) {
      throw new Error('Can\'t find SSL key in ' + argv.sslKey)
    }

    var cert
    try {
      cert = fs.readFileSync(argv.sslCert)
    } catch (e) {
      throw new Error('Can\'t find SSL cert in ' + argv.sslCert)
    }

    var credentials = {
      key: key,
      cert: cert
    }

    if (ldp.webid && ldp.auth === 'tls') {
      credentials.requestCert = true
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
