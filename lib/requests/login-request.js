'use strict'

const url = require('url')
const validUrl = require('valid-url')

const debug = require('./../debug').authentication
const UserAccount = require('../models/user-account')

/**
 * Models a Login request, a POST submit from a Login form with a username and
 * password. Used with authMethod of 'oidc'.
 *
 * For usage example, see `handle()` docstring, below.
 */
class LoginByPasswordRequest {
  /**
   * @constructor
   * @param [options={}] {Object}
   *
   * @param [options.username] {string} Unique identifier submitted by user
   *   from the Login form. Can be one of:
   *   - An account name (e.g. 'alice'), if server is in Multi-User mode
   *   - A WebID URI (e.g. 'https://alice.example.com/#me')
   *
   * @param [options.password] {string} Plaintext password as submitted by user
   *
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.userStore] {UserStore}
   * @param [options.accountManager] {AccountManager}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   */
  constructor (options = {}) {
    this.username = options.username
    this.password = options.password
    this.response = options.response
    this.session = options.session || {}
    this.userStore = options.userStore
    this.accountManager = options.accountManager
    this.authQueryParams = options.authQueryParams || {}
  }

  /**
   * Handles a Login request on behalf of a middleware handler. Usage:
   *
   *   ```
   *   app.post('/login', (req, res, next) = {
   *     LoginByPasswordRequest.handle(req, res)
   *       .catch(next)
   *   })
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @throws {Error} HTTP 400 error if required parameters are missing, or
   *   if the user is not found or the password does not match.
   *
   * @return {Promise}
   */
  static handle (req, res) {
    let request

    try {
      request = LoginByPasswordRequest.fromParams(req, res)
    } catch (error) {
      return Promise.reject(error)
    }

    return LoginByPasswordRequest.login(request)
  }

  /**
   * Factory method, returns an initialized instance of LoginByPasswordRequest
   * from an incoming http request.
   *
   * @param [req={}] {IncomingRequest}
   * @param [res={}] {ServerResponse}
   *
   * @return {LoginByPasswordRequest}
   */
  static fromParams (req = {}, res = {}) {
    let body = req.body || {}

    let userStore, accountManager

    if (req.app && req.app.locals) {
      let locals = req.app.locals

      if (locals.oidc) {
        userStore = locals.oidc.users
      }

      accountManager = locals.accountManager
    }

    let options = {
      username: body.username,
      password: body.password,
      response: res,
      session: req.session,
      userStore,
      accountManager,
      authQueryParams: LoginByPasswordRequest.extractQueryParams(body)
    }

    return new LoginByPasswordRequest(options)
  }

  /**
   * Performs the login operation -- validates required parameters, loads the
   * appropriate user, inits the session if passwords match, and redirects the
   * user to continue their OIDC auth flow.
   *
   * @param request {LoginByPasswordRequest}
   *
   * @throws {Error} HTTP 400 error if required parameters are missing, or
   *   if the user is not found or the password does not match.
   *
   * @return {Promise}
   */
  static login (request) {
    return Promise.resolve()
      .then(() => {
        request.validate()

        return request.findValidUser()
      })
      .then(validUser => {
        request.initUserSession(validUser)
        request.redirectPostLogin(validUser)
      })
  }

  /**
   * Initializes query params required by OIDC work flow from the request body.
   * Only authorized params are loaded, all others are discarded.
   *
   * @param body {Object} Key/value hashmap, ie `req.body`.
   *
   * @return {Object}
   */
  static extractQueryParams (body) {
    let extracted = {}

    let paramKeys = LoginByPasswordRequest.AUTH_QUERY_PARAMS
    let value

    for (let p of paramKeys) {
      value = body[p]
      value = value === 'undefined' ? undefined : value
      extracted[p] = value
    }

    return extracted
  }

  /**
   * Validates the Login request (makes sure required parameters are present),
   * and throws an error if not.
   *
   * @throws {TypeError} If missing required params
   */
  validate () {
    let error

    if (!this.username) {
      error = new TypeError('Username required')
      error.statusCode = 400
      throw error
    }

    if (!this.password) {
      error = new TypeError('Password required')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Loads a user from the user store, and if one is found and the
   * password matches, returns a `UserAccount` instance for that user.
   *
   * @throws {TypeError} If
   *
   * @return {Promise<UserAccount>}
   */
  findValidUser () {
    let error
    let userOptions

    if (validUrl.isUri(this.username)) {
      // A WebID URI was entered into the username field
      userOptions = { webid: this.username }
    } else {
      // A regular username
      userOptions = { username: this.username }
    }

    return Promise.resolve()
      .then(() => {
        let user = this.accountManager.userAccountFrom(userOptions)

        debug(`Attempting to login user: ${user.id}`)

        return this.userStore.findUser(user.id)
      })
      .then(foundUser => {
        if (!foundUser) {
          error = new TypeError('No user found for that username')
          error.statusCode = 400
          throw error
        }

        return this.userStore.matchPassword(foundUser, this.password)
      })
      .then(validUser => {
        if (!validUser) {
          error = new TypeError('User found but no password found')
          error.statusCode = 400
          throw error
        }

        debug('User found, password matches')

        return UserAccount.from(validUser)
      })
  }

  /**
   * Initializes a session (for subsequent authentication/authorization) with
   * a given user's credentials.
   *
   * @param validUser {UserAccount}
   */
  initUserSession (validUser) {
    let session = this.session

    session.userId = validUser.webId
    session.identified = true
    session.subject = {
      _id: validUser.webId
    }
  }

  /**
   * Returns the /authorize url to redirect the user to after the login form.
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
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostLogin (validUser) {
    let uri

    if (this.authQueryParams['redirect_uri']) {
      // Login request is part of an app's auth flow
      uri = this.authorizeUrl()
    } else {
      // Login request is a user going to /login in browser
      uri = this.accountManager.accountUriFor(validUser.username)
    }

    debug('Login successful, redirecting to ', uri)

    this.response.redirect(uri)
  }
}

/**
 * Hidden form fields from the login page that must be passed through to the
 * Authentication request.
 *
 * @type {Array<string>}
 */
LoginByPasswordRequest.AUTH_QUERY_PARAMS = ['response_type', 'display', 'scope',
  'client_id', 'redirect_uri', 'state', 'nonce']

module.exports.LoginByPasswordRequest = LoginByPasswordRequest
