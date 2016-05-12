'use strict'
/**
 * OIDC Relying Party API handler module.
 */

var express = require('express')
var debug = require('../debug')
var util = require('../utils')
// const bodyParser = require('body-parser')
var path = require('path')

module.exports.api = api
module.exports.authenticate = authenticate
module.exports.rpCallback = rpCallback

/**
 * OIDC Relying Party API middleware.
 * Usage:
 *
 *   ```
 *   app.use('/api/oidc', oidcHandler.api(corsSettings))
 *   ```
 * @param corsSettings
 * @returns {Router} Express router
 */
function api (corsSettings) {
  const router = express.Router('/')

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.use('/', express.static(path.join(__dirname, '../static/oidc')))
  // router.post('/signin', bodyParser.urlencoded({extended: false}),
  //   (req, res, next) => {
  //     // const userServer = req.body.oidcServer
  //   })
  router.get('/rp', rpCallback)
  // router.get('/signout', (req, res, next) => {
  //   req.session.userId = null
  //   req.session.identified = false
  //   res.send('signed out...')
  // })

  return router
}

/**
 * Authenticates an incoming request. Extracts & verifies access token,
 * creates an OIDC client if necessary, etc.
 * After successful authentication, the `req` object has the following
 * attributes set:
 *   - `req.accessToken`  (Raw token in encoded string form)
 *   - `req.accessTokenClaims`  (JWT OIDC AccessToken decoded & verified)
 *   - `req.userInfo` (OIDC /userinfo details, fetched with access token)
 *   - `req.userInfo.profile` (we currently store the WebID URL here)
 *   - `req.oidcClient`  (OIDC client *for this particular request*)
 * If there is no access token (and thus no authentication), all those values
 * above will be null.
 * @param oidcRpClient {OidcRpClient} This server's RP client (contains trusted
 *   client and the client store)
 * @throws {UnauthorizedError} HTTP 400 error on invalid auth headers,
 *   or HTTP 401 Unauthorized error from verifier()
 */
function authenticate (oidcRpClient) {
  const router = express.Router('/')

  router.use('/', express.static(path.join(__dirname, '../static/oidc')))

  router.use('/', loadAuthClient(oidcRpClient))
  router.use('/', authWithClient)
  router.use('/', authSessionInit)

  return router
}

/**
 * Loads the WebID (that was loaded from the OIDC provider) into the user's
 * session.
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function authSessionInit (req, res, next) {
  if (!req.userInfo) {
    debug.oidc('authSessionInit: no req.userInfo, skipping session')
    return next()
  }
  debug.oidc('authSessionInit: starting up user session, recording userId')
  var webId = req.userInfo.profile
  // TODO fix this
  webId = webId + '#me'
  req.session.userId = webId
  req.session.identified = true
  debug.oidc('WebId: ' + webId)
  next()
}

/**
 * Authenticates the access token (verifies it, etc), and loads the token,
 * the parsed claims, and the userInfo into the `req` object for downstream
 * use. (See docstring to `authenticate()` for the attributes set.)
 * Requires that `loadAuthClient()` is called before it.
 * @method authWithClient
 * @param req
 * @param res
 * @param next
 */
function authWithClient (req, res, next) {
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
  // verifier calls next()
  verifier(req, res, next)
}

/**
 * Extracts the OIDC Issuer URL from the token, and loads (or creates) a client
 * for that issuer. Stores it in the `req` object for downstream use.
 * @method loadAuthClient
 * @param oidcRpClient {OidcRpClient} This server's RP client (contains trusted
 *   client and the client store)
 */
function loadAuthClient (oidcRpClient) {
  return (req, res, next) => {
    debug.oidc('loadAuthClient: for req ' + util.fullUrlForReq(req))
    var issuer
    try {
      issuer = oidcRpClient.trustedClient.extractIssuer(req)
    } catch (err) {
      debug.oidc('Error during extractIssuer: ' + err)
      return next(err)
    }
    if (!issuer) {
      debug.oidc('Un-authenticated request, no token, next()')
      return next()
    }
    debug.oidc('Extracted issuer: ' + issuer)
    // retrieve it from store
    oidcRpClient.clients.get(issuer)
      .then((client) => {
        debug.oidc('Client fetched for issuer.')
        if (client) {
          return client
        }
        debug.oidc('Client not present, initializing new client.')
        // client not already in store, create and register it
        let clientConfig = {
          issuer: issuer,
          redirect_uri: oidcRpClient.trustedClient.redirect_uri,
          scope: 'openid profile'
        }
        return oidcRpClient.initClient(clientConfig)
      })
      .then((client) => {
        debug.oidc('loadAuthClient: Client initialized')
        req.oidcIssuer = issuer
        req.oidcClient = client
        return next()
      })
      .catch((err) => { next(err) })
  }
}

function rpCallback (req, res, next) {
  console.log('In authRp handler:')
  if (req.session.returnToUrl) {
    console.log('  Redirecting to ' + req.session.returnToUrl)
    return res.redirect(302, req.session.returnToUrl)
  }
  res.send('OK')
}
