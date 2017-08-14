'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const OidcManager = require('../../models/oidc-manager')

const { LoginRequest } = require('../../requests/login-request')

const PasswordResetEmailRequest = require('../../requests/password-reset-email-request')
const PasswordChangeRequest = require('../../requests/password-change-request')

const {
  AuthCallbackRequest,
  LogoutRequest,
  SelectProviderRequest
} = require('oidc-auth-manager').handlers

/**
 * Sets up OIDC authentication for the given app.
 *
 * @param app {Object} Express.js app instance
 * @param argv {Object} Config options hashmap
 */
function initialize (app, argv) {
  const oidc = OidcManager.fromServerConfig(argv)
  app.locals.oidc = oidc
  oidc.initialize()

  // Attach the OIDC API
  app.use('/', middleware(oidc))

  // Perform the actual authentication
  let rsOptions = {
    allow: { audience: [app.locals.host.serverUri] }
  }
  app.use('/', oidc.rs.authenticate(rsOptions))

  // Expose session.userId
  app.use('/', (req, res, next) => {
    const userId = oidc.webIdFromClaims(req.claims)
    if (userId) {
      req.session.userId = userId
    }
    next()
  })
}

/**
 * Returns a router with OIDC Relying Party and Identity Provider middleware:
 *
 * @method middleware
 *
 * @param oidc {OidcManager}
 *
 * @return {Router} Express router
 */
function middleware (oidc) {
  const router = express.Router('/')

  // User-facing Authentication API
  router.get('/api/auth/select-provider', SelectProviderRequest.get)
  router.post('/api/auth/select-provider', bodyParser, SelectProviderRequest.post)

  router.get(['/login', '/signin'], LoginRequest.get)

  router.post('/login/password', bodyParser, LoginRequest.loginPassword)

  router.post('/login/tls', bodyParser, LoginRequest.loginTls)

  router.get('/account/password/reset', PasswordResetEmailRequest.get)
  router.post('/account/password/reset', bodyParser, PasswordResetEmailRequest.post)

  router.get('/account/password/change', PasswordChangeRequest.get)
  router.post('/account/password/change', bodyParser, PasswordChangeRequest.post)

  router.get('/logout', LogoutRequest.handle)

  router.get('/goodbye', (req, res) => { res.render('auth/goodbye') })

  // The relying party callback is called at the end of the OIDC signin process
  router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get)

  // Initialize the OIDC Identity Provider routes/api
  // router.get('/.well-known/openid-configuration', discover.bind(provider))
  // router.get('/jwks', jwks.bind(provider))
  // router.post('/register', register.bind(provider))
  // router.get('/authorize', authorize.bind(provider))
  // router.post('/authorize', authorize.bind(provider))
  // router.post('/token', token.bind(provider))
  // router.get('/userinfo', userinfo.bind(provider))
  // router.get('/logout', logout.bind(provider))
  let oidcProviderApi = require('oidc-op-express')(oidc.provider)
  router.use('/', oidcProviderApi)

  return router
}

/**
 * Sets the `WWW-Authenticate` response header for 401 error responses.
 * Used by error-pages handler.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function setAuthenticateHeader (req, res, err) {
  let locals = req.app.locals

  let errorParams = {
    realm: locals.host.serverUri,
    scope: 'openid webid',
    error: err.error,
    error_description: err.error_description,
    error_uri: err.error_uri
  }

  let challengeParams = Object.keys(errorParams)
    .filter(key => !!errorParams[key])
    .map(key => `${key}="${errorParams[key]}"`)
    .join(', ')

  res.set('WWW-Authenticate', 'Bearer ' + challengeParams)
}

/**
 * Provides custom logic for error status code overrides.
 *
 * @param statusCode {number}
 * @param req {IncomingRequest}
 *
 * @returns {number}
 */
function statusCodeOverride (statusCode, req) {
  if (isEmptyToken(req)) {
    return 400
  } else {
    return statusCode
  }
}

/**
 * Tests whether the `Authorization:` header includes an empty or missing Bearer
 * token.
 *
 * @param req {IncomingRequest}
 *
 * @returns {boolean}
 */
function isEmptyToken (req) {
  let header = req.get('Authorization')

  if (!header) { return false }

  if (header.startsWith('Bearer')) {
    let fragments = header.split(' ')

    if (fragments.length === 1) {
      return true
    } else if (!fragments[1]) {
      return true
    }
  }

  return false
}

module.exports = {
  initialize,
  isEmptyToken,
  middleware,
  setAuthenticateHeader,
  statusCodeOverride
}
