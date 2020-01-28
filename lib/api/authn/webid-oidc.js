'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const { routeResolvedFile } = require('../../utils')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const OidcManager = require('../../models/oidc-manager')
const { LoginRequest } = require('../../requests/login-request')
const { SharingRequest } = require('../../requests/sharing-request')

const restrictToTopDomain = require('../../handlers/restrict-to-top-domain')

const PasswordResetEmailRequest = require('../../requests/password-reset-email-request')
const PasswordChangeRequest = require('../../requests/password-change-request')

const { AuthCallbackRequest } = require('@solid/oidc-auth-manager').handlers

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
  app.use('/', async (req, res, next) => {
    oidc.rs.authenticate()(req, res, (err) => {
      // Error handling should be deferred to the ldp in case a user with a bad token is trying
      // to access a public resource
      if (err) {
        req.authError = err
        res.status(200)
      }
      next()
    })
  })

  // Expose session.userId
  app.use('/', (req, res, next) => {
    oidc.webIdFromClaims(req.claims)
      .then(webId => {
        if (webId) {
          req.session.userId = webId
        }

        next()
      })
      .catch(err => {
        let error = new Error('Could not verify Web ID from token claims')
        error.statusCode = 401
        error.statusText = 'Invalid login'
        error.cause = err

        console.error(err)

        next(error)
      })
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
  router.get(['/login', '/signin'], LoginRequest.get)

  router.post('/login/password', bodyParser, LoginRequest.loginPassword)

  router.post('/login/tls', bodyParser, LoginRequest.loginTls)

  router.get('/sharing', SharingRequest.get)
  router.post('/sharing', bodyParser, SharingRequest.share)

  router.get('/account/password/reset', restrictToTopDomain, PasswordResetEmailRequest.get)
  router.post('/account/password/reset', restrictToTopDomain, bodyParser, PasswordResetEmailRequest.post)

  router.get('/account/password/change', restrictToTopDomain, PasswordChangeRequest.get)
  router.post('/account/password/change', restrictToTopDomain, bodyParser, PasswordChangeRequest.post)

  router.get('/.well-known/solid/logout/', (req, res) => res.redirect('/logout'))

  router.get('/goodbye', (req, res) => { res.render('auth/goodbye') })

  // The relying party callback is called at the end of the OIDC signin process
  router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get)

  // Static assets related to authentication
  const authAssets = [
    ['/.well-known/solid/login/', '../static/popup-redirect.html', false],
    ['/common/', 'solid-auth-client/dist-popup/popup.html']
  ]
  authAssets.map(args => routeResolvedFile(router, ...args))

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
