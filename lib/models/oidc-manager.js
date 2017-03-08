'use strict'

const url = require('url')
const debug = require('./../debug').oidc

const OidcManager = require('oidc-auth-manager')
const LogoutRequest = require('../requests/logout-request')

/**
 * Returns an instance of the OIDC Authentication Manager, initialized from
 * argv / config.json server parameters.
 *
 * @param argv {Object} Config hashmap
 *
 * @param argv.host {SolidHost} Initialized SolidHost instance, including
 *   `serverUri`.
 *
 * @param [argv.dbPath='./db/oidc'] {string} Path to the auth-related storage
 *   directory (users, tokens, client registrations, etc, will be stored there).
 *
 * @param argv.saltRounds {number} Number of bcrypt password salt rounds
 *
 * @return {OidcManager} Initialized instance, includes a UserStore,
 *   OIDC Clients store, a Resource Authenticator, and an OIDC Provider.
 */
function fromServerConfig (argv) {
  let providerUri = argv.host.serverUri
  if (!providerUri) {
    throw new Error('Host with serverUri required for auth initialization')
  }

  let authCallbackUri = url.resolve(providerUri, '/api/oidc/rp')
  let postLogoutUri = url.resolve(providerUri, '/goodbye')

  let options = {
    providerUri,
    dbPath: argv.dbPath || './db/oidc',
    authCallbackUri,
    postLogoutUri,
    saltRounds: argv.saltRounds,
    host: { authenticate, obtainConsent, logout }
  }

  return OidcManager.from(options)
}

// This gets called from OIDC Provider's /authorize endpoint
function authenticate (authRequest) {
  let session = authRequest.req.session
  debug('AUTHENTICATE injected method')

  if (session.identified && session.userId) {
    debug('User webId found in session: ', session.userId)

    authRequest.subject = {
      _id: session.userId  // put webId into the IDToken's subject claim
    }
  } else {
    // User not authenticated, send them to login
    debug('User not authenticated, sending to /login')

    let loginUrl = url.parse('/login')
    loginUrl.query = authRequest.req.query
    loginUrl = url.format(loginUrl)
    authRequest.subject = null
    authRequest.res.redirect(loginUrl)
  }
  return authRequest
}

function obtainConsent (authRequest) {
  if (authRequest.subject) {
    let { req, res } = authRequest

    if (req.body.consent) {
      authRequest.consent = true
      authRequest.scope = authRequest.params.scope
      debug('OBTAINED CONSENT')
    } else {
      let params = req.query['client_id'] ? req.query : req.body

      // let clientId = params['client_id']
      // let locals = req.app.locals
      // let clientStore = locals.oidc.clients

      res.render('auth/consent', params)
      authRequest.headersSent = true
    }
  }

  return authRequest
}

function logout (logoutRequest) {
  return LogoutRequest.handle(logoutRequest.req, logoutRequest.res)
    .then(() => logoutRequest)
}

module.exports = {
  fromServerConfig,
  authenticate,
  obtainConsent,
  logout
}
