// Configure a client for the local OpenID Connect Provider service
// var oidc =
// app.locals.oidcClient = oidc
// oidc.client.discover()
'use strict'
var express = require('express')
var path = require('path')
const bodyParser = require('body-parser')
// const Store = require('abstract-oidc-store')
const authRp = require('./handlers/auth-rp')

const OIDClientStore = require('./oidc-client-store')
const OIDCExpressClient = require('anvil-connect-express')
var debug = require('./debug')
var util = require('./utils')

/**
 * OIDC Provider
 * Usage:
 *
 *   ```
 *   var providerConfig = {
 *     issuer: 'https://oidc.local',
 *     client_id: 'CLIENT_ID',
 *     client_secret: 'CLIENT_SECRET',
 *     redirect_uri: 'https://ldnode.local:8443/api/oidc/rp'
 *   }
 *   var oidc = new Provider()
 *   oidc.ensureTrustedClient(providerConfig)
 *   ```
 * @class Provider
 */
module.exports = class Provider {
  /**
   * @constructor
   * @param [clientStore] {OIDClientStore}
   */
  constructor (clientStore) {
    this.clients = clientStore || new OIDClientStore()
    this.trustedClient = new OIDCExpressClient()
  }

  /**
   * Authenticates an incoming request. Extracts & verifies access token,
   * creates an OIDC client if necessary, etc.
   * After this function completes, the `req` object has the following
   * attributes set:
   *   - `req.accessToken`  (Raw token in encoded string form)
   *   - `req.accessTokenClaims`  (JWT OIDC AccessToken decoded & verified)
   *   - `req.userInfo` (OIDC /userinfo details, fetched with access token)
   *   - `req.userInfo.profile` (we currently store the WebID URL here)
   * @param req {IncomingMessage} Express request object
   * @param res
   * @param next {Function} Express callback
   * @throws {UnauthorizedError} HTTP 400 error on invalid auth headers,
   *   or HTTP 401 Unauthorized error from verifier()
   */
  authenticate () {
    var router = express.Router('/')
    var oidc = this
    router.use('/',
      (req, res, next) => {
        debug.oidc('in authenticate()..')
      },
      oidc.loadAuthClient.bind(oidc),
      (req, res, next) => {
        debug.oidc('in authWithClient():')
        if (!req.oidcClient) {
          debug.oidc('   * No oidcClient found, next()')
          return next()
        }
        const client = req.oidcClient
        const verifyOptions = {
          allowNoToken: true,
          loadUserInfo: true
        }
        let verifier = client.verifier(verifyOptions)
        verifier(req, res, next)
      },
      oidc.authSessionInit.bind(oidc)
    )
    return router
  }

  loadAuthClient (req, res, next) {
    debug.oidc('loadAuthClient: for req ' + util.fullUrlForReq(req))
    var issuer
    try {
      issuer = this.trustedClient.extractIssuer(req)
    } catch (err) {
      debug.oidc('Error during extractIssuer: ' + err)
      return next(err)
    }
    if (!issuer) {
      debug.oidc('Un-authenticated request, no token, next()')
      return next()
    }
    debug.oidc('Extracted issuer: ' + issuer)
    // const verifyOptions = {
    //   allowNoToken: true,
    //   loadUserInfo: true
    // }
    var self = this
    // retrieve it from store
    this.clients.get(issuer)
      .then((client) => {
        debug.oidc('Client fetched for issuer.')
        if (client) {
          return client
        }
        debug.oidc('Client not present, initializing new client.')
        // client not already in store, create and register it
        let clientConfig = {
          issuer: issuer,
          redirect_uri: self.trustedClient.redirect_uri,
          scope: 'openid profile'
        }
        return self.initClient(clientConfig)
      })
      .then((client) => {
        debug.oidc('loadAuthClient: Client initialized')
        req.oidcIssuer = issuer
        req.oidcClient = client
        return next()
      })
      .catch((err) => { next(err) })
  }

  authSessionInit (req, res, next) {
    if (!req.userInfo) {
      debug.oidc('authSessionInit: no req.userInfo, skipping session')
      return next()
    }
    debug.oidc('authSessionInit: starting up user session, recording userId')
    var webId = req.userInfo.profile
    webId = webId + '#me'
    req.session.userId = webId
    req.session.identified = true
    debug.oidc('WebId: ' + webId)
    next()
  }

  /**
   * Ensures that the client for the server's trusted OIDC provider exists in
   * the client store. If it doesn't exist, this method creates, initializes,
   * and registers such a client, and stores it in the client store.
   * @param providerConfig {Object} Provider options (client store, local creds)
   * @return {Promise}
   */
  ensureTrustedClient (providerConfig) {
    const issuer = providerConfig.issuer
    debug.idp('Issuer: ' + issuer)
    this.clients.get(issuer)
      .then((client) => {
        debug.idp('Retrieved trusted client. Issuer: ' + issuer)
        if (client) {
          return  // trusted client already in store
        }
        debug.idp('Initializing trusted client.')
        return this.initClient(providerConfig)
          .then((client) => {
            debug.idp('Trusted client initialized.')
            this.trustedClient = client
          })
      })
  }

  /**
   * Returns an initialized (and registered) instance of an OIDC client for a
   * given set of credentials (issuer/client id, etc).
   * @param config {Object}
   * @return {Promise<OIDCExpressClient>} Initialized/registered api client
   */
  initClient (config) {
    var api = new OIDCExpressClient(config)
    debug.idp('Running client.initProvider()...')
    return api.client.initProvider()
      .then(() => {
        debug.idp('Client discovered, JWKs retrieved')
        if (!api.client.client_id) {
          // Register if you haven't already.
          debug.idp('Registering client')
          return api.client.register(this.registration)
        }
      })
      .then(() => {
        debug.idp('Storing registerd client')
        return this.clients.put(api)
      })
      .then(() => api)
      .catch((err) => { throw err })
  }

  middleware (corsSettings) {
    const router = express.Router('/')

    if (corsSettings) {
      router.use(corsSettings)
    }

    router.use('/', express.static(path.join(__dirname, '../static/oidc')))
    router.post('/signin', bodyParser.urlencoded({extended: false}),
      (req, res, next) => {
        // const userServer = req.body.oidcServer
      })
    router.get('/rp',
      authRp)
    router.get('/signout', (req, res, next) => {
      req.session.userId = null
      req.session.identified = false
      res.send('signed out...')
    })

    return router
  }

  /**
   * Returns the Signin page URL for the trusted OIDC provider
   * @param req {IncomingMessage} Express request object
   * @returns {String}
   */
  urlForSignin (req) {
    // return 'https://anvil.local/authorize?stuff'
    var loginUrl = this.trustedClient.client.authorizationUri({
      endpoint: 'signin',
      nonce: '123',
      response_mode: 'query',
      response_type: 'token id_token',
      redirect_uri: this.trustedClient.redirect_uri
    })
    return loginUrl
  }
}
