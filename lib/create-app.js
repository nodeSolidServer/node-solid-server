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
const fs = require('fs-extra')
const path = require('path')
const EmailService = require('./models/email-service')
const AccountRecovery = require('./account-recovery')
const capabilityDiscovery = require('./capability-discovery')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const API = require('./api')
const errorPages = require('./handlers/error-pages')
const OidcManager = require('./models/oidc-manager')
const defaults = require('../config/defaults')
const options = require('./handlers/options')

const corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Updates-Via, Allow, Content-Length',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

function createApp (argv = {}) {
  argv.host = SolidHost.from({ port: argv.port, serverUri: argv.serverUri })
  argv.auth = argv.auth || defaults.AUTH_METHOD
  argv.templates = initTemplates()

  let ldp = new LDP(argv)
  let app = express()

  initAppLocals(app, argv, ldp)

  initHeaders(app)

  // Use session cookies
  let useSecureCookies = argv.webid  // argv.webid forces https and secure cookies
  app.use(session(sessionSettings(useSecureCookies, argv.host)))

  // Adding proxy
  if (argv.proxy) {
    proxy(app, ldp.proxy)
  }

  // Options handler
  app.options('/*', options)

  if (argv.apiApps) {
    app.use('/api/apps', express.static(argv.apiApps))
  }

  if (argv.webid) {
    var accountRecovery = AccountRecovery({ redirect: '/' })
    // adds GET /api/accounts/recover
    // adds POST /api/accounts/recover
    // adds GET /api/accounts/validateToken
    app.use('/api/accounts/', accountRecovery)

    let accountManager = AccountManager.from({
      authMethod: argv.auth,
      emailService: app.locals.emailService,
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

    // Messaging API
    app.post('/api/messages', bodyParser, API.messages.send())
  }

  if (argv.idp) {
    app.use(vhost('*', LdpMiddleware(corsSettings)))
  }

  app.use('/', LdpMiddleware(corsSettings))

  // Errors
  app.use(errorPages)

  return app
}

function initTemplates () {
  let accountTemplatePath = ensureTemplateCopiedTo(
    '../default-account-template',
    '../config/account-template'
  )

  let emailTemplatesPath = ensureTemplateCopiedTo(
    '../default-email-templates',
    '../config/email-templates'
  )

  return {
    account: accountTemplatePath,
    email: emailTemplatesPath
  }
}

/**
 * Ensures that a template directory has been initialized in `config/` from
 * default templates.
 *
 * @param defaultTemplateDir {string} Path to a default template directory,
 *   relative to `lib/`. For example, '../default-email-templates' contains
 *   various email templates pre-defined by the Solid dev team.
 *
 * @param configTemplateDir {string} Path to a template directory customized
 *   to this particular installation (relative to `lib/`). Server operators
 *   are encouraged to override/customize these templates in the `config/`
 *   directory.
 *
 * @return {string} Returns the absolute path to the customizable template copy
 */
function ensureTemplateCopiedTo (defaultTemplateDir, configTemplateDir) {
  let configTemplatePath = path.join(__dirname, configTemplateDir)
  let defaultTemplatePath = path.join(__dirname, defaultTemplateDir)

  if (!fs.existsSync(configTemplatePath)) {
    fs.copySync(defaultTemplatePath, configTemplatePath)
  }

  return configTemplatePath
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

  if (argv.email && argv.email.host) {
    app.locals.emailService = new EmailService(argv.templates.email, argv.email)
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

  switch (authMethod) {
    case 'tls':
      // Enforce authentication with WebID-TLS on all LDP routes
      app.use('/', API.tls.authenticate())
      break
    case 'oidc':
      let oidc = OidcManager.fromServerConfig(argv)
      app.locals.oidc = oidc

      // This is where the OIDC-enabled signup/signin apps live
      app.use('/', express.static(path.join(__dirname, '../static/oidc')))
      initAuthTemplates(app)

      // Initialize the WebId-OIDC authentication routes/api, including:
      // user-facing Solid endpoints (/login, /logout, /api/auth/discover)
      // and OIDC-specific ones
      app.use('/', API.oidc.middleware(oidc))

      oidc.initialize()

      // Enforce authentication with WebID-OIDC on all LDP routes
      app.use('/', oidc.rs.authenticate())
      break
    default:
      throw new TypeError('Unsupported authentication scheme')
  }
}

/**
 * Sets up Handlebars to be used for auth-related views.
 *
 * @param app {Function} Express.js app instance
 */
function initAuthTemplates (app) {
  app.set('views', path.join(__dirname, '../views'))
  app.engine('.hbs', handlebars({ extname: '.hbs' }))
  app.set('view engine', '.hbs')
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
