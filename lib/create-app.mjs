import express from 'express'
import session from 'express-session'
import handlebars from 'express-handlebars'
import { v4 as uuid } from 'uuid'
import cors from 'cors'
import vhost from 'vhost'
import aclCheck from '@solid/acl-check'
import path from 'path'
import { createRequire } from 'module'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import acceptEventsModule from 'express-accept-events'
import negotiateEventsModule from 'express-negotiate-events'
import eventIDModule from 'express-prep/event-id'
import prepModule from 'express-prep'

// ESM equivalents of __filename and __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json synchronously to avoid using require() for JSON
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))

// Complex internal modules - keep as CommonJS for now except where ESM available
import LDP from './ldp.mjs'
import LdpMiddleware from './ldp-middleware.mjs'
import corsProxy from './handlers/cors-proxy.mjs'
import authProxy from './handlers/auth-proxy.mjs'
import SolidHost from'./models/solid-host.mjs'
import AccountManager from './models/account-manager.mjs'
import EmailService from './services/email-service.mjs'
import TokenService from './services/token-service.mjs'
import capabilityDiscovery from './capability-discovery.mjs'
import paymentPointerDiscovery from './payment-pointer-discovery.mjs'
import * as API from './api/index.mjs'
import errorPages from './handlers/error-pages.mjs'
import * as config from './server-config.mjs'
import defaults from '../config/defaults.mjs'
import options from './handlers/options.mjs'
import { handlers as debug } from './debug.mjs'
import { routeResolvedFile } from './utils.mjs'
import ResourceMapper from './resource-mapper.mjs'

// Extract default exports from ESM modules
const acceptEvents = acceptEventsModule.default
const events = negotiateEventsModule.default
const eventID = eventIDModule.default
const prep = prepModule.default

// Defensive fallbacks: if any of these weren't provided as functions (for example
// when the optional packages are missing or export differently), replace them
// with no-op middleware so `app.use(...)` doesn't receive `undefined`.
function noopMiddleware (req, res, next) { return next() }
const safeEventID = typeof eventID === 'function' ? eventID : noopMiddleware
const safeAcceptEvents = typeof acceptEvents === 'function' ? acceptEvents : noopMiddleware
const safeEvents = typeof events === 'function' ? events : noopMiddleware
const safePrep = typeof prep === 'function' ? prep : noopMiddleware

const corsSettings = cors({
  methods: [
    'OPTIONS', 'HEAD', 'GET', 'PATCH', 'POST', 'PUT', 'DELETE'
  ],
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Accept-Put, Updates-Via, Allow, WAC-Allow, Content-Length, WWW-Authenticate, MS-Author-Via, X-Powered-By',
  credentials: true,
  maxAge: 1728000,
  origin: true,
  preflightContinue: true
})

function createApp (argv = {}) {
  // Override default configs (defaults) with passed-in params (argv)
  argv = Object.assign({}, defaults, argv)

  argv.host = SolidHost.from(argv)

  argv.resourceMapper = new ResourceMapper({
    rootUrl: argv.serverUri,
    rootPath: path.resolve(argv.root || process.cwd()),
    includeHost: argv.multiuser,
    defaultContentType: argv.defaultContentType
  })

  const configPath = config.initConfigDir(argv)
  argv.templates = config.initTemplateDirs(configPath)

  config.printDebugInfo(argv)

  const ldp = new LDP(argv)

  const app = express()

  // Temporary instrumentation: wrap `app.route` and `app.use` to detect
  // registrations of undefined handlers which cause "Route.get() requires a
  // callback function but got a [object Undefined]" errors during tests.
  // This will log the path, method and the offending handler for diagnosis
  // and can be removed once the problematic registration is fixed.
  ;(function instrumentApp () {
    try {
      const origRoute = app.route.bind(app)
      app.route = function (path) {
        const route = origRoute(path)
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
        methods.forEach(m => {
          const orig = route[m].bind(route)
          route[m] = function (...handlers) {
            handlers.forEach((h, i) => {
              if (typeof h !== 'function') {
                console.error('\n[diagnostic] Non-function handler detected for route', m.toUpperCase(), path)
                console.error('[diagnostic] handler index:', i, 'value:', h)
                console.error(new Error().stack)
              }
            })
            return orig(...handlers)
          }
        })
        return route
      }

      const origUse = app.use.bind(app)
      app.use = function (...args) {
        // app.use can be called as app.use(fn) or app.use(path, fn)
        const handlers = args.filter(a => typeof a === 'function' || Array.isArray(a)).slice(-1)
        handlers.forEach((h, idx) => {
          if (Array.isArray(h)) {
            h.forEach((hh, ii) => {
              if (typeof hh !== 'function') {
                console.error('\n[diagnostic] Non-function middleware detected in app.use array at index', ii, 'value:', hh)
                console.error(new Error().stack)
              }
            })
          } else if (typeof h !== 'function') {
            console.error('\n[diagnostic] Non-function middleware detected in app.use args at index', idx, 'value:', h)
            console.error(new Error().stack)
          }
        })
        return origUse(...args)
      }
    } catch (e) {
      console.error('[diagnostic] failed to instrument app.route/app.use', e)
    }
  })()

  // Also instrument Express Router methods (get/post/use/put/patch/delete/options/head)
  ;(function instrumentRouter () {
    try {
      const proto = express.Router && express.Router.prototype
      if (!proto) { return }
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'use']
      methods.forEach(m => {
        if (!proto[m]) { return }
        const orig = proto[m]
        proto[m] = function (...args) {
          // handlers can be provided as (path, fn...), or (fn...)
          const handlers = args.slice(typeof args[0] === 'string' || args[0] instanceof RegExp ? 1 : 0)
          handlers.forEach((h, i) => {
            if (Array.isArray(h)) {
              h.forEach((hh, ii) => {
                if (typeof hh !== 'function') {
                  console.error('\n[diagnostic] Non-function handler detected for router.%s at path %s', m, args[0])
                  console.error('[diagnostic] handler index:', i, 'array index:', ii, 'value:', hh)
                  console.error(new Error().stack)
                }
              })
            } else if (typeof h !== 'function') {
              console.error('\n[diagnostic] Non-function handler detected for router.%s at path %s', m, args[0])
              console.error('[diagnostic] handler index:', i, 'value:', h)
              console.error(new Error().stack)
            }
          })
          return orig.apply(this, args)
        }
      })
    } catch (e) {
      console.error('[diagnostic] failed to instrument express.Router methods', e)
    }
  })()

  // Add PREP support
  if (argv.prep) {
    // Use the safe fallbacks to avoid passing `undefined` to app.use()
    app.use(safeEventID)
    app.use(safeAcceptEvents, safeEvents, safePrep)
  }

  initAppLocals(app, argv, ldp)
  initHeaders(app)
  initViews(app, configPath)
  initLoggers()

  // Serve the public 'common' directory (for shared CSS files, etc)
  app.use('/common', express.static(path.join(__dirname, '../common')))
  app.use('/', express.static(path.dirname(import.meta.resolve('mashlib/dist/databrowser.html')), { index: false }))
  routeResolvedFile(app, '/common/js/', 'solid-auth-client/dist-lib/solid-auth-client.bundle.js')
  routeResolvedFile(app, '/common/js/', 'solid-auth-client/dist-lib/solid-auth-client.bundle.js.map')
  app.use('/.well-known', express.static(path.join(__dirname, '../common/well-known')))

  // Serve bootstrap from it's node_module directory
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css')
  routeResolvedFile(app, '/common/css/', 'bootstrap/dist/css/bootstrap.min.css.map')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.eot')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.svg')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.ttf')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.woff')
  routeResolvedFile(app, '/common/fonts/', 'bootstrap/dist/fonts/glyphicons-halflings-regular.woff2')

  // Serve OWASP password checker from it's node_module directory
  routeResolvedFile(app, '/common/js/', 'owasp-password-strength-test/owasp-password-strength-test.js')
  // Serve the TextEncoder polyfill
  routeResolvedFile(app, '/common/js/', 'text-encoder-lite/text-encoder-lite.min.js')

  // Add CORS proxy
  if (argv.proxy) {
    console.warn('The proxy configuration option has been renamed to corsProxy.')
    argv.corsProxy = argv.corsProxy || argv.proxy
    delete argv.proxy
  }
  if (argv.corsProxy) {
    corsProxy(app, argv.corsProxy)
  }

  // Options handler
  app.options('/*', options)

  // Set up API
  if (argv.apiApps) {
    app.use('/api/apps', express.static(argv.apiApps))
  }

  // Authenticate the user
  if (argv.webid) {
    initWebId(argv, app, ldp)
  }
  // Add Auth proxy (requires authentication)
  if (argv.authProxy) {
    authProxy(app, argv.authProxy)
  }

  // Attach the LDP middleware
  // Server-side diagnostic middleware: logs incoming requests and when responses finish.
  // Helps detect requests that never complete (hang) during tests.
  app.use((req, res, next) => {
    try {
      const cookie = req.get('Cookie') || req.get('cookie') || ''
      console.error('[srv-debug] incoming request:', req.method, req.path, 'cookie-present:', !!cookie)
    } catch (e) {
      console.error('[srv-debug] incoming request: error reading headers', e)
    }
    const start = Date.now()
    res.on('finish', () => {
      try {
        console.error('[srv-debug] request finished:', req.method, req.path, 'status:', res.statusCode, 'durationMs:', Date.now() - start)
      } catch (e) {
        console.error('[srv-debug] request finished: error logging', e)
      }
    })
    next()
  })

  app.use('/', LdpMiddleware(corsSettings, argv.prep))

  // https://stackoverflow.com/questions/51741383/nodejs-express-return-405-for-un-supported-method
  app.use(function (req, res, next) {
    const AllLayers = app._router.stack
    const Layers = AllLayers.filter(x => x.name === 'bound dispatch' && x.regexp.test(req.path))

    const Methods = []
    Layers.forEach(layer => {
      for (const method in layer.route.methods) {
        if (layer.route.methods[method] === true) {
          Methods.push(method.toUpperCase())
        }
      }
    })

    if (Layers.length !== 0 && !Methods.includes(req.method)) {
      // res.setHeader('Allow', Methods.join(','))

      if (req.method === 'OPTIONS') {
        return res.send(Methods.join(', '))
      } else {
        return res.status(405).send()
      }
    } else {
      next()
    }
  })

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
  app.locals.appUrls = argv.apps // used for service capability discovery
  app.locals.host = argv.host
  app.locals.authMethod = argv.auth
  app.locals.localAuth = argv.localAuth
  app.locals.tokenService = new TokenService()
  app.locals.enforceToc = argv.enforceToc
  app.locals.tocUri = argv.tocUri
  app.locals.disablePasswordChecks = argv.disablePasswordChecks
  app.locals.prep = argv.prep

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
    res.set('X-Powered-By', 'solid-server/' + version)

    // Cors lib adds Vary: Origin automatically, but inreliably
    res.set('Vary', 'Accept, Authorization, Origin')

    // Set default Allow methods
    res.set('Allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE')
    next()
  })

  app.use('/', capabilityDiscovery())
  app.use('/', paymentPointerDiscovery())
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
    partialsDir: viewsPath,
    defaultLayout: null
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

  // Store the user's session key in a cookie
  // (for same-domain browsing by people only)
  const useSecureCookies = !!argv.sslKey // use secure cookies when over HTTPS
  const sessionHandler = session(sessionSettings(useSecureCookies, argv.host))
  app.use(sessionHandler)
  // Reject cookies from third-party applications.
  // Otherwise, when a user is logged in to their Solid server,
  // any third-party application could perform authenticated requests
  // without permission by including the credentials set by the Solid server.
  app.use((req, res, next) => {
    const origin = req.get('origin')
    const trustedOrigins = ldp.getTrustedOrigins(req)
    const userId = req.session.userId
    // Exception: allow logout requests from all third-party apps
    // such that OIDC client can log out via cookie auth
    // TODO: remove this exception when OIDC clients
    // use Bearer token to authenticate instead of cookie
    // (https://github.com/solid/node-solid-server/pull/835#issuecomment-426429003)
    //
    // Authentication cookies are an optimization:
    // instead of going through the process of
    // fully validating authentication on every request,
    // we go through this process once,
    // and store its successful result in a cookie
    // that will be reused upon the next request.
    // However, that cookie can then be sent by any server,
    // even servers that have not gone through the proper authentication mechanism.
    // However, if trusted origins are enabled,
    // then any origin is allowed to take the shortcut route,
    // since malicious origins will be banned at the ACL checking phase.
    // https://github.com/solid/node-solid-server/issues/1117
    if (!argv.strictOrigin && !argv.host.allowsSessionFor(userId, origin, trustedOrigins) && !isLogoutRequest(req)) {
      debug.authentication(`Rejecting session for ${userId} from ${origin}`)
      // Destroy session data
      delete req.session.userId
      // Ensure this modified session is not saved
      req.session.save = (done) => done()
    }
    if (isLogoutRequest(req)) {
      delete req.session.userId
    }
    next()
  })

  const accountManager = AccountManager.from({
    authMethod: argv.auth,
    emailService: app.locals.emailService,
    tokenService: app.locals.tokenService,
    host: argv.host,
    accountTemplatePath: argv.templates.account,
    store: ldp,
    multiuser: argv.multiuser
  })
  app.locals.accountManager = accountManager

  // Account Management API (create account, new cert)
  app.use('/', API.accounts.middleware(accountManager))

  // Set up authentication-related API endpoints and app.locals
  initAuthentication(app, argv)

  if (argv.multiuser) {
    app.use(vhost('*', LdpMiddleware(corsSettings, argv.prep)))
  }
}

function initLoggers () {
  aclCheck.configureLogger(debug.ACL)
}

/**
 * Determines whether the given request is a logout request
 */
function isLogoutRequest (req) {
  // TODO: this is a hack that hard-codes OIDC paths,
  // this code should live in the OIDC module
  return req.path === '/logout' || req.path === '/goodbye'
}

/**
 * Sets up authentication-related routes and handlers for the app.
 *
 * @param app {Object} Express.js app instance
 * @param argv {Object} Config options hashmap
 */
function initAuthentication (app, argv) {
  const auth = argv.forceUser ? 'forceUser' : argv.auth
  if (!(auth in API.authn)) {
    throw new Error(`Unsupported authentication scheme: ${auth}`)
  }
  API.authn[auth].initialize(app, argv)
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
  const sessionSettings = {
    name: 'nssidp.sid',
    secret: uuid(),
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

export default createApp
