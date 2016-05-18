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
var EmailService = require('./email-service')
var series = require('async').series
const AccountRecovery = require('./account-recovery')
const capabilityDiscovery = require('./capability-discovery')
const bodyParser = require('body-parser')
const API = require('./api')

var corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Updates-Via, Allow, Content-Length',
  credentials: true,
  maxAge: 1728000,
  origin: true
})

function createApp (argv = {}) {
  var ldp = new LDP(argv)
  var app = express()

  // check if we have master ACL or not
  var masterAcl
  var checkMasterAcl = function (req, callback) {
    if (masterAcl) {
      return callback(true)
    }

    ldp.exists(req.hostname, '/' + ldp.suffixAcl, function (err) {
      if (!err) {
        masterAcl = true
      }
      callback(!err)
    })
  }

  // Setting options as local variable
  app.locals.ldp = ldp
  app.locals.appUrls = argv.apps  // used for service capability discovery

  if (argv.email && argv.email.host) {
    app.locals.email = new EmailService(argv.email)
  }

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

  app.use('/', capabilityDiscovery(corsSettings))

  // Session
  app.use(session(sessionSettings))

  // Adding proxy
  if (ldp.proxy) {
    proxy(app, ldp.proxy)
  }

  if (ldp.webid) {
    var accountRecovery = AccountRecovery(corsSettings, { redirect: '/' })
    // adds GET /api/accounts/recover
    // adds POST /api/accounts/recover
    // adds GET /api/accounts/validateToken
    app.use('/api/accounts/', accountRecovery)
  }

  // Adding Multi-user support
  if (ldp.webid) {
    var idp = IdentityProvider({
      store: ldp,
      suffixAcl: ldp.suffixAcl,
      suffixMeta: ldp.suffixMeta,
      settings: 'settings',
      inbox: 'inbox',
      auth: ldp.auth
    })
    const addIdp = (corsSettings, overwrite) => {
      return (req, res, next) => {
        series([
          (cb) => idp.middleware(corsSettings, overwrite)(req, res, cb),
          (cb) => idp.get(req, res, cb)
        ], next)
      }
    }
    var needsOverwrite = function (req, res, next) {
      checkMasterAcl(req, function (found) {
        if (!found) {
          // this allows IdentityProvider to overwrite root acls
          addIdp(corsSettings, true)(req, res, next)
        } else if (found && ldp.idp) {
          addIdp(corsSettings, false)(req, res, next)
        } else {
          next()
        }
      })
    }

    // adds POST /api/accounts/new
    // adds POST /api/accounts/newCert
    app.use('/api/accounts', needsOverwrite)
    app.post('/api/accounts/signin', corsSettings, bodyParser.urlencoded({ extended: false }), API.accounts.signin())
    app.post('/api/accounts/signout', corsSettings, API.accounts.signout())
  }

  if (ldp.idp) {
    app.use(vhost('*', LdpMiddleware(corsSettings)))
  }

  app.get('/', function (req, res, next) {
    // Do not bother showing html page can't be read
    if (!req.accepts('text/html') || !ldp.webid) {
      return next()
    }

    checkMasterAcl(req, function (found) {
      if (!found) {
        res.set('Content-Type', 'text/html')
        var signup = path.join(__dirname, '../static/signup.html')
        res.sendFile(signup)
      } else {
        next()
      }
    })
  })
  app.use('/', LdpMiddleware(corsSettings))

  return app
}
