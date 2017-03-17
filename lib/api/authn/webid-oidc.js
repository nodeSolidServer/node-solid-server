'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const debug = require('../../debug')
const util = require('../../utils')
const error = require('../../http-error')
const bodyParser = require('body-parser').urlencoded({ extended: false })

const SelectProviderRequest = require('../../requests/select-provider-request')

const { LoginByPasswordRequest } = require('../../requests/login-request')

/**
 * Returns a router with OIDC Relying Party and Identity Provider middleware:
 *
 *   1. Adds a Relying Party (RP) callback handler on '/api/oidc/rp/:issuer_id'
 *   2. Sets up a static content handler for signin/signup apps
 *   3. Adds a set of Identity Provider (OP) endpoints on '/'
 *
 * Usage (in create-app.js):
 *
 *   ```
 *   app.use('/', oidcHandler.api(oidc))
 *   ```
 * @method middleware
 *
 * @param oidc {OidcManager}
 *
 * @return {Router} Express router
 */
function middleware (oidc) {
  const router = express.Router('/')

  // User-facing Authentication API
  router.get('/api/auth/select-provider', (req, res) => {
    res.render('auth/select-provider')
  })
  router.post('/api/auth/select-provider', bodyParser, selectProvider)

  router.post(['/login', '/signin'], bodyParser, login)

  router.get('/goodbye', (req, res) => {
    res.render('auth/goodbye')
  })

  // The relying party callback is called at the end of the OIDC signin process
  router.get('/api/oidc/rp/:issuer_id', (req, res, next) => {
    // Exchange authorization code for id token
    authCodeFlowCallback(oidc, req)
      // Redirect the user back to returnToUrl
      .then(() => { resumeUserFlow(req, res) })
      .catch(next)
  })

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

function selectProvider (req, res, next) {
  return SelectProviderRequest.handle(req, res)
    .catch(error => {
      error.status = error.status || 400
      next(error)
    })
}

function login (req, res, next) {
  return LoginByPasswordRequest.handle(req, res)
    .catch(error => {
      error.status = error.status || 400
      next(error)
    })
}

function authCodeFlowCallback (oidc, req) {
  debug.oidc('in authCodeFlowCallback()')

  if (!req.params || !req.params.issuer_id) {
    return Promise.reject(error(400, 'Invalid auth response uri - missing issuer id'))
  }

  let issuer = getIssuerId(req)

  return oidc.clients.clientForIssuer(issuer)
    .then(client => {
      return validateResponse(client, req)
    })
    .then(response => {
      initSessionUserAuth(response, req)
    })
    .catch((err) => {
      debug.oidc(err)
      throw error(400, err)
    })
}

function getIssuerId (req = {}) {
  return req.params && decodeURIComponent(req.params.issuer_id)
}

function validateResponse (client, req) {
  let url = util.fullUrlForReq(req)
  return client.validateResponse(url, req.session)
}

function initSessionUserAuth (authResponse, req) {
  let webId = extractWebId(authResponse)
  req.session.accessToken = authResponse.params.access_token
  req.session.refreshToken = authResponse.params.refresh_token
  req.session.userId = webId
  req.session.identified = true
}

function extractWebId (authResponse) {
  return authResponse.decoded.payload.sub
}

/**
 * Redirects the user back to their original requested resource, at the end
 * of the OIDC authentication process.
 * @method resumeUserFlow
 */
function resumeUserFlow (req, res) {
  debug.oidc('In resumeUserFlow handler:')

  if (req.session.returnToUrl) {
    let returnToUrl = req.session.returnToUrl
    // if (req.session.accessToken) {
    //   returnToUrl += '?access_token=' + req.session.accessToken
    // }
    debug.oidc('  Redirecting to ' + returnToUrl)
    delete req.session.returnToUrl
    return res.redirect(302, returnToUrl)
  }
  res.send('Resume User Flow (failed)')
}

module.exports = {
  middleware,
  selectProvider,
  login,
  extractWebId,
  authCodeFlowCallback,
  getIssuerId,
  initSessionUserAuth,
  resumeUserFlow,
  validateResponse
}
