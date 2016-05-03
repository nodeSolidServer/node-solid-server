module.exports = createApp

var express = require('express')
var session = require('express-session')
var uuid = require('node-uuid')
var cors = require('cors')
var LDP = require('./ldp')
var LdpMiddleware = require('./ldp-middleware')
var proxy = require('./handlers/proxy')
var IdentityProvider = require('./identity-provider')
var vhost = require('vhost')
var path = require('path')
var corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Updates-Via, Allow, Content-Length',
  credentials: true,
  maxAge: 1728000,
  origin: true
})

function createApp (argv) {
  var ldp = new LDP(argv)
  var app = express()

  // Setting options as local variable
  app.locals.ldp = ldp

  var sessionSettings = {
    secret: ldp.secret || uuid.v1(),
    saveUninitialized: false,
    resave: false,
    rolling: true
  }

  // Cookies should set to be secure if https is on
  if (ldp.webid || ldp.idp) {
    sessionSettings.cookie = {
      secure: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  }

  // Set X-Powered-By
  app.use(function (req, res, next) {
    res.set('X-Powered-By', 'solid-server')
    next()
  })

  // Set default Allow methods
  app.use(function (req, res, next) {
    res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')
    next()
  })

  // Session
  app.use(session(sessionSettings))

  // Adding proxy
  if (ldp.proxy) {
    proxy(app, ldp.proxy)
  }

  // Adding Multi-user support
  if (ldp.idp || ldp.createAdmin) {
    var idp = IdentityProvider({
      store: ldp,
      suffixAcl: ldp.suffixAcl,
      overwrite: ldp.createAdmin,
      settings: 'settings',
      inbox: 'inbox'
    })
    app.use('/accounts', idp.middleware(corsSettings))
    app.use('/', corsSettings, idp.get.bind(idp))
  }

  if (ldp.idp) {
    app.use(vhost('*', LdpMiddleware(corsSettings)))
  }

  if (ldp.createAdmin) {
    app.get('/', function (req, res) {
      res.set('Content-Type', 'text/html')
      var signup = path.join(__dirname, '../static/signup.html')
      res.sendFile(signup)
    })
  }
  app.use('/', LdpMiddleware(corsSettings))

  return app
}
