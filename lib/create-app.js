module.exports = createApp

const express = require('express')
const session = require('express-session')
const favicon = require('serve-favicon')
const uuid = require('uuid')
const cors = require('cors')
const LDP = require('./ldp')
const LdpMiddleware = require('./ldp-middleware')
const proxy = require('./handlers/proxy')
const SolidHost = require('./models/solid-host')
const AccountManager = require('./models/account-manager')
const vhost = require('vhost')
const fs = require('fs-extra')
const path = require('path')
const EmailService = require('./email-service')
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
  argv.accountTemplatePath = ensureAccountTemplate()

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

  // Use session cookies
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

    let accountManager = AccountManager.from({
      authMethod: argv.auth,
      emailService: app.locals.email,
      host: argv.host,
      accountTemplatePath: argv.accountTemplatePath,
      store: ldp,
      multiUser
    })

    // Account Management API (create account, new cert)
    app.use('/', API.userAccounts.middleware(accountManager))

    // Authentication API (login/logout)
    app.post('/api/accounts/signin', bodyParser, API.authn.signin())
    app.post('/api/accounts/signout', API.authn.signout())

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

/**
 * Ensures that an Account Template directory has been initialized in `config/`
 * (copied from `./account-template-default/`, for admin customization).
 *
 * @return {string} Path to the account template dir in config/
 */
function ensureAccountTemplate () {
  // The config/ account template path is in .gitignore, for customization
  let accountTemplate = path.join(__dirname, '../config/account-template')

  if (!fs.existsSync(accountTemplate)) {
    let defaultTemplate = path.join(__dirname, '../account-template-default')
    fs.copySync(defaultTemplate, accountTemplate)
  }

  return accountTemplate
}
