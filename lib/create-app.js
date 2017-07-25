module.exports = createApp

const express = require('express')
const session = require('express-session')
const handlebars = require('express-handlebars')
const uuid = require('uuid')
const cors = require('cors')
const LDP = require('./ldp')
const LdpMiddleware = require('./ldp-middleware')
const proxy = require('./handlers/proxy')
const SolidHost = require('./models/solid-host')
const AccountManager = require('./models/account-manager')
const vhost = require('vhost')
const EmailService = require('./models/email-service')
const TokenService = require('./models/token-service')
const capabilityDiscovery = require('./capability-discovery')
const API = require('./api')
const errorPages = require('./handlers/error-pages')
const OidcManager = require('./models/oidc-manager')
const config = require('./server-config')
const defaults = require('../config/defaults')
const options = require('./handlers/options')

const corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, Content-Length, WWW-Authenticate',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = Object.assign({}, defaults, argv)

  argv.host = SolidHost.from({ port: argv.port, serverUri: argv.serverUri })

  const configPath = config.initConfigDir(argv)
  argv.templates = config.initTemplateDirs(configPath)

  const ldp = new LDP(argv)

  const app = express()

  initAppLocals(app, argv, ldp)
  initHeaders(app)
  initViews(app, configPath)

  // Serve the public 'common' directory (for shared CSS files, etc)
  app.use('/common', express.static('common'))

  // Adding proxy
  if (argv.proxy) {
    proxy(app, argv.proxy)
  }

  // Options handler
  app.options('/*', options)

  if (argv.apiApps) {
    app.use('/api/apps', express.static(argv.apiApps))
  }

  if (argv.webid) {
    initWebId(argv, app, ldp)
  }

  app.use('/', LdpMiddleware(corsSettings))

  // Errors
  app.use(errorPages.handler)

  return app
}

/**
 * Initializes `app.locals` parameters for downstream use (typically by route
 * handlers).
 *
 * @param app {Function} Express.js app instance
 * @param argv {Object} Config options hashmap
 * @param ldp {LDP}
 */
function initAppLocals (app, argv, ldp) {
  app.locals.ldp = ldp
  app.locals.appUrls = argv.apps  // used for service capability discovery
  app.locals.host = argv.host
  app.locals.authMethod = argv.auth
  app.locals.localAuth = argv.localAuth
  app.locals.tokenService = new TokenService()

  if (argv.email && argv.email.host) {
    app.locals.emailService = new EmailService(argv.templates.email, argv.email)
  }
}

/**
 * Sets up headers common to all Solid requests (CORS-related, Allow, etc).
 *
 * @param app {Function} Express.js app instance
 */
function initHeaders (app) {
  app.use(corsSettings)

  app.use((req, res, next) => {
    // Set X-Powered-By
    res.set('X-Powered-By', 'solid-server')
    // Set default Allow methods
    res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')
    next()
  })

  app.use('/', capabilityDiscovery())
}

/**
 * Sets up the express rendering engine and views directory.
 *
 * @param app {Function} Express.js app
 * @param configPath {string}
 */
function initViews (app, configPath) {
  const viewsPath = config.initDefaultViews(configPath)

  app.set('views', viewsPath)
  app.engine('.hbs', handlebars({
    extname: '.hbs',
    partialsDir: viewsPath
  }))
  app.set('view engine', '.hbs')
}

/**
 * Sets up WebID-related functionality (account creation and authentication)
 *
 * @param argv {Object}
 * @param app {Function}
 * @param ldp {LDP}
 */
function initWebId (argv, app, ldp) {
  config.ensureWelcomePage(argv)

  // Use session cookies
  const useSecureCookies = argv.webid  // argv.webid forces https and secure cookies
  app.use(session(sessionSettings(useSecureCookies, argv.host)))

  let accountManager = AccountManager.from({
    authMethod: argv.auth,
    emailService: app.locals.emailService,
    tokenService: app.locals.tokenService,
    host: argv.host,
    accountTemplatePath: argv.templates.account,
    store: ldp,
    multiUser: argv.idp
  })
  app.locals.accountManager = accountManager

  // Account Management API (create account, new cert)
  app.use('/', API.accounts.middleware(accountManager))

  // Set up authentication-related API endpoints and app.locals
  initAuthentication(argv, app)

  if (argv.idp) {
    app.use(vhost('*', LdpMiddleware(corsSettings)))
  }
}

/**
 * Sets up authentication-related routes and handlers for the app.
 *
 * @param argv {Object} Config options hashmap
 * @param app {Function} Express.js app instance
 */
function initAuthentication (argv, app) {
  let authMethod = argv.auth

  if (argv.forceUser) {
    app.use('/', API.authn.overrideWith(argv.forceUser))
    return
  }

  switch (authMethod) {
    case 'tls':
      // Enforce authentication with WebID-TLS on all LDP routes
      app.use('/', API.tls.authenticate())
      if (argv.certificateHeader) {
        app.locals.certificateHeader = argv.certificateHeader.toLowerCase()
      }
      break
    case 'oidc':
      let oidc = OidcManager.fromServerConfig(argv)
      app.locals.oidc = oidc

      oidc.initialize()

      // Initialize the WebId-OIDC authentication routes/api, including:
      // user-facing Solid endpoints (/login, /logout, /api/auth/select-provider)
      // and OIDC-specific ones
      app.use('/', API.oidc.middleware(oidc))

      // Enforce authentication with WebID-OIDC on all LDP routes
      app.use('/', oidc.rs.authenticate())

      break
    default:
      throw new TypeError('Unsupported authentication scheme')
  }
}

/**
 * Returns a settings object for Express.js sessions.
 *
 * @param secureCookies {boolean}
 * @param host {SolidHost}
 *
 * @return {Object} `express-session` settings object
 */
function sessionSettings (secureCookies, host) {
  let sessionSettings = {
    secret: uuid.v1(),
    saveUninitialized: false,
    resave: false,
    rolling: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
  }
  // Cookies should set to be secure if https is on
  if (secureCookies) {
    sessionSettings.cookie.secure = true
  }

  // Determine the cookie domain
  sessionSettings.cookie.domain = host.cookieDomain

  return sessionSettings
}
