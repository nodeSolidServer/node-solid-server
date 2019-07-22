'use strict'

const url = require('url')
const debug = require('./../debug').authentication

const IDToken = require('@solid/oidc-op/src/IDToken')

/**
 * Hidden form fields from the login page that must be passed through to the
 * Authentication request.
 *
 * @type {Array<string>}
 */
const AUTH_QUERY_PARAMS = ['response_type', 'display', 'scope',
  'client_id', 'redirect_uri', 'state', 'nonce', 'request']

/**
 * Base authentication request (used for login and password reset workflows).
 */
class AuthRequest {
  /**
   * @constructor
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.userStore] {UserStore}
   * @param [options.accountManager] {AccountManager}
   * @param [options.returnToUrl] {string}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   * @param [options.enforceToc] {boolean} Whether or not to enforce the service provider's T&C
   * @param [options.tocUri] {string} URI to the service provider's T&C
   */
  constructor (options) {
    this.response = options.response
    this.session = options.session || {}
    this.userStore = options.userStore
    this.accountManager = options.accountManager
    this.returnToUrl = options.returnToUrl
    this.authQueryParams = options.authQueryParams || {}
    this.localAuth = options.localAuth
    this.enforceToc = options.enforceToc
    this.tocUri = options.tocUri
  }

  /**
   * Extracts a given parameter from the request - either from a GET query param,
   * a POST body param, or an express registered `/:param`.
   * Usage:
   *
   *   ```
   *   AuthRequest.parseParameter(req, 'client_id')
   *   // -> 'client123'
   *   ```
   *
   * @param req {IncomingRequest}
   * @param parameter {string} Parameter key
   *
   * @return {string|null}
   */
  static parseParameter (req, parameter) {
    let query = req.query || {}
    let body = req.body || {}
    let params = req.params || {}

    return query[parameter] || body[parameter] || params[parameter] || null
  }

  /**
   * Extracts the options in common to most auth-related requests.
   *
   * @param req
   * @param res
   *
   * @return {Object}
   */
  static requestOptions (req, res) {
    let userStore, accountManager, localAuth

    if (req.app && req.app.locals) {
      let locals = req.app.locals

      if (locals.oidc) {
        userStore = locals.oidc.users
      }

      accountManager = locals.accountManager

      localAuth = locals.localAuth
    }

    let authQueryParams = AuthRequest.extractAuthParams(req)
    let returnToUrl = AuthRequest.parseParameter(req, 'returnToUrl')
    const acceptToc = AuthRequest.parseParameter(req, 'acceptToc') === 'true'

    let options = {
      response: res,
      session: req.session,
      userStore,
      accountManager,
      returnToUrl,
      authQueryParams,
      localAuth,
      acceptToc
    }

    return options
  }

  /**
   * Initializes query params required by Oauth2/OIDC type work flow from the
   * request body.
   * Only authorized params are loaded, all others are discarded.
   *
   * @param req {IncomingRequest}
   *
   * @return {Object}
   */
  static extractAuthParams (req) {
    let params
    if (req.method === 'POST') {
      params = req.body
    } else {
      params = req.query
    }

    if (!params) { return {} }

    let extracted = {}

    let paramKeys = AUTH_QUERY_PARAMS
    let value

    for (let p of paramKeys) {
      value = params[p]
      // value = value === 'undefined' ? undefined : value
      extracted[p] = value
    }

     // Special case because solid-auth-client does not include redirect in params
    if (!extracted['redirect_uri'] && params.request) {
      extracted['redirect_uri'] = IDToken.decode(params.request).payload.redirect_uri
    }

    return extracted
  }

  /**
   * Calls the appropriate form to display to the user.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error, body) {
    error.statusCode = error.statusCode || 400

    this.renderForm(error, body)
  }

  /**
   * Initializes a session (for subsequent authentication/authorization) with
   * a given user's credentials.
   *
   * @param userAccount {UserAccount}
   */
  initUserSession (userAccount) {
    let session = this.session

    debug('Initializing user session with webId: ', userAccount.webId)

    session.userId = userAccount.webId
    session.subject = {
      _id: userAccount.webId
    }

    return userAccount
  }

  /**
   * Returns this installation's /authorize url. Used for redirecting post-login
   * and post-signup.
   *
   * @return {string}
   */
  authorizeUrl () {
    let host = this.accountManager.host
    let authUrl = host.authEndpoint

    authUrl.query = this.authQueryParams

    return url.format(authUrl)
  }

  /**
   * Returns this installation's /register url. Used for redirecting post-signup.
   *
   * @return {string}
   */
  registerUrl () {
    let host = this.accountManager.host
    let signupUrl = url.parse(url.resolve(host.serverUri, '/register'))

    signupUrl.query = this.authQueryParams

    return url.format(signupUrl)
  }

  /**
   * Returns this installation's /login url.
   *
   * @return {string}
   */
  loginUrl () {
    let host = this.accountManager.host
    let signupUrl = url.parse(url.resolve(host.serverUri, '/login'))

    signupUrl.query = this.authQueryParams

    return url.format(signupUrl)
  }

  sharingUrl () {
    let host = this.accountManager.host
    let sharingUrl = url.parse(url.resolve(host.serverUri, '/sharing'))

    sharingUrl.query = this.authQueryParams

    return url.format(sharingUrl)
  }
}

AuthRequest.AUTH_QUERY_PARAMS = AUTH_QUERY_PARAMS

module.exports = AuthRequest
