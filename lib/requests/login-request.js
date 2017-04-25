'use strict'

const url = require('url')
const validUrl = require('valid-url')

const debug = require('./../debug').authentication
const UserAccount = require('../models/user-account')

/**
 * Models a Login request, a POST submit from a Login form with a username and
 * password. Used with authMethod of 'oidc'.
 *
 * For usage example, see `post()` and `get()` docstrings, below.
 */
class LoginByPasswordRequest {
  /**
   * @constructor
   * @param options {Object}
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
  constructor (options) {
    this.username = options.username
    this.password = options.password
    this.response = options.response
    this.session = options.session || {}
    this.userStore = options.userStore
    this.accountManager = options.accountManager
    this.authQueryParams = options.authQueryParams || {}
  }

  /**
   * Handles a Login GET request on behalf of a middleware handler. Usage:
   *
   *   ```
   *   app.get('/login', LoginByPasswordRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = LoginByPasswordRequest.fromParams(req, res)

    request.renderView()
  }

  /**
   * Handles a Login POST request on behalf of a middleware handler. Usage:
   *
   *   ```
   *   app.post('/login', LoginByPasswordRequest.post)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {Promise}
   */
  static post (req, res) {
    const request = LoginByPasswordRequest.fromParams(req, res)

    return LoginByPasswordRequest.login(request)
      .catch(request.error.bind(request))
  }

  /**
   * Factory method, returns an initialized instance of LoginByPasswordRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {LoginByPasswordRequest}
   */
  static fromParams (req, res) {
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
      authQueryParams: LoginByPasswordRequest.extractParams(req)
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
   * @param req {IncomingRequest}
   *
   * @return {Object}
   */
  static extractParams (req) {
    let params
    if (req.method === 'POST') {
      params = req.body || {}
    } else {
      params = req.query || {}
    }

    let extracted = {}

    let paramKeys = LoginByPasswordRequest.AUTH_QUERY_PARAMS
    let value

    for (let p of paramKeys) {
      value = params[p]
      value = value === 'undefined' ? undefined : value
      extracted[p] = value
    }

    return extracted
  }

  error (error) {
    let res = this.response
    let params = Object.assign({}, this.authQueryParams, {error: error.message})

    res.status(error.statusCode || 400)

    res.render('auth/login', params)
  }

  renderView () {
    let res = this.response
    let params = Object.assign({}, this.authQueryParams,
      { postRegisterUrl: this.postRegisterUrl() })

    res.render('auth/login', params)
  }

  /**
   * Validates the Login request (makes sure required parameters are present),
   * and throws an error if not.
   *
   * @throws {Error} If missing required params
   */
  validate () {
    let error

    if (!this.username) {
      error = new Error('Username required')
      error.statusCode = 400
      throw error
    }

    if (!this.password) {
      error = new Error('Password required')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Loads a user from the user store, and if one is found and the
   * password matches, returns a `UserAccount` instance for that user.
   *
   * @throws {Error} If failures to load user are encountered
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
          error = new Error('No user found for that username')
          error.statusCode = 400
          throw error
        }

        return this.userStore.matchPassword(foundUser, this.password)
      })
      .then(validUser => {
        if (!validUser) {
          error = new Error('User found but no password found')
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

    debug('Initializing user session with webId: ', validUser.webId)

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

  postLoginUrl (validUser) {
    let uri

    if (this.authQueryParams['redirect_uri']) {
      // Login request is part of an app's auth flow
      uri = this.authorizeUrl()
    } else if (validUser) {
      // Login request is a user going to /login in browser
      uri = this.accountManager.accountUriFor(validUser.username)
    }

    return uri
  }

  postRegisterUrl () {
    let uri

    if (this.authQueryParams['redirect_uri']) {
      // Login/register request is part of an app's auth flow
      uri = this.authorizeUrl()
    } else {
      // User went to /register directly, not part of an auth flow
      let host = this.accountManager.host
      uri = host.serverUri
    }

    uri = encodeURIComponent(uri)

    return uri
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostLogin (validUser) {
    let uri = this.postLoginUrl(validUser)

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
