'use strict'

const url = require('url')
const debug = require('./../debug').oidc

const OidcManager = require('oidc-auth-manager')

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
  let postLogoutUri = url.resolve(providerUri, '/signed_out.html')

  let options = {
    providerUri,
    dbPath: argv.dbPath || './db/oidc',
    authCallbackUri,
    postLogoutUri,
    saltRounds: argv.saltRounds,
    host: { authenticate, obtainConsent, logout }
  }
  let oidc = OidcManager.from(options)
  oidc.initialize()
    .then(() => {
      oidc.saveProviderConfig()
      return oidc.clients.clientForIssuer(providerUri)
    })
    .then(localClient => {
      console.log('Local RP client initialized')
      oidc.localRp = localClient
    })

  return oidc
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
  let req = logoutRequest.req
  req.session.accessToken = ''
  req.session.refreshToken = ''
  // req.session.issuer = ''
  req.session.userId = ''
  req.session.identified = false
  // Inject post_logout_redirect_uri here? (If Accept: text/html)
  debug('LOGOUT behavior')
  return logoutRequest
}

module.exports = {
  fromServerConfig,
  authenticate,
  obtainConsent,
  logout
}
