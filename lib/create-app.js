module.exports = createApp

const express = require('express')
const session = require('express-session')
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
  argv.templates = initTemplates()

  let ldp = new LDP(argv)
  let app = express()

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
    app.locals.emailService = new EmailService(argv.templates.email, argv.email)
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
  let useSecureCookies = argv.webid  // argv.webid forces https and secure cookies
  app.use(session(sessionSettings(useSecureCookies, argv.host)))

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
      emailService: app.locals.emailService,
      host: argv.host,
      accountTemplatePath: argv.templates.account,
      store: ldp,
      multiUser
    })

    // Account Management API (create account, new cert)
    app.use('/', API.accounts.middleware(accountManager))

    // Authentication API (login/logout)
    app.post('/api/accounts/signin', bodyParser, API.authn.signin())
    app.post('/api/accounts/signout', API.authn.signout())

    // Messaging API
    app.post('/api/messages', authentication, bodyParser, API.messages.send())
  }

  if (argv.apiApps) {
    app.use('/api/apps', express.static(argv.apiApps))
  }

  if (ldp.idp) {
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
