'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const bodyParser = require('body-parser').urlencoded({ extended: false })

const { LoginByPasswordRequest } = require('../../requests/login-request')

const PasswordResetEmailRequest = require('../../requests/password-reset-email-request')
const PasswordChangeRequest = require('../../requests/password-change-request')

const {
  AuthCallbackRequest,
  LogoutRequest,
  SelectProviderRequest
} = require('oidc-auth-manager').handlers

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

  router.get(['/login', '/signin'], LoginByPasswordRequest.get)
  router.post(['/login', '/signin'], bodyParser, LoginByPasswordRequest.post)

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

module.exports = {
  middleware
}
