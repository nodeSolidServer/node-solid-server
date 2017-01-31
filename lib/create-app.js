module.exports = createApp

var express = require('express')
var session = require('express-session')
const favicon = require('serve-favicon')
var uuid = require('uuid')
var cors = require('cors')
var LDP = require('./ldp')
var LdpMiddleware = require('./ldp-middleware')
var proxy = require('./handlers/proxy')
const SolidHost = require('./models/solid-host')
const UserAccountManager = require('./models/account-manager')
// var IdentityProvider = require('./models/identity-provider')
var vhost = require('vhost')
var path = require('path')
var EmailService = require('./email-service')
const AccountRecovery = require('./account-recovery')
const capabilityDiscovery = require('./capability-discovery')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const API = require('./api')
const authentication = require('./handlers/authentication')
const errorPages = require('./handlers/error-pages')

var corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, Content-Length',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

function createApp (argv = {}) {
  argv.host = SolidHost.from({ port: argv.port, serverUri: argv.serverUri })

  let ldp = new LDP(argv)
  let app = express()

  app.use(favicon(path.join(__dirname, '../static/favicon.ico')))
  app.use(corsSettings)

  app.options('*', (req, res, next) => {
    res.status(204)
    next()
  })

  // Setting options as local variable
  app.locals.ldp = ldp
  app.locals.appUrls = argv.apps // used for service capability discovery
  let multiUser = argv.idp

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
  if (ldp.webid || multiUser) {
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

  app.use('/', capabilityDiscovery())

  // Session
  app.use(session(sessionSettings))

  // Adding proxy
  if (ldp.proxy) {
    proxy(app, ldp.proxy)
  }

  if (ldp.webid) {
    var accountRecovery = AccountRecovery({ redirect: '/' })
    // adds GET /api/accounts/recover
    // adds POST /api/accounts/recover
    // adds GET /api/accounts/validateToken
    app.use('/api/accounts/', accountRecovery)

    let accountManager = UserAccountManager.from({
      authMethod: argv.auth,
      emailService: app.locals.email,
      host: argv.host,
      store: ldp,
      multiUser
    })

    // Account Management API (create account, new cert)
    app.use('/', API.userAccounts.middleware(accountManager))

    // Authentication API (login/logout)
    app.post('/api/accounts/signin', bodyParser, API.accounts.signin())
    app.post('/api/accounts/signout', API.accounts.signout())

    // Messaging API
    app.post('/api/messages', authentication, bodyParser, API.messages.send())
  }

  if (argv.apiApps) {
    app.use('/api/apps', express.static(argv.apiApps))
  }

  app.use('/api/*', API.notImplemented)

  if (ldp.idp) {
    app.use(vhost('*', LdpMiddleware(corsSettings)))
  }

  app.use('/', LdpMiddleware(corsSettings))

  // Errors
  app.use(errorPages)

  return app
}
