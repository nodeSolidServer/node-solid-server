'use strict'

const debug = require('./../debug').authentication

const AuthRequest = require('./auth-request')
const { PasswordAuthenticator, TlsAuthenticator } = require('../models/authenticator')

const PASSWORD_AUTH = 'password'
const TLS_AUTH = 'tls'

/**
 * Models a local Login request
 */
class LoginRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.userStore] {UserStore}
   * @param [options.accountManager] {AccountManager}
   * @param [options.returnToUrl] {string}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   * @param [options.authenticator] {Authenticator} Auth strategy by which to
   *   log in
   */
  constructor (options) {
    super(options)

    this.authenticator = options.authenticator
    this.client_id = this.authQueryParams['client_id']
  }

  /**
   * Factory method, returns an initialized instance of LoginRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   * @param authMethod {string}
   *
   * @return {LoginRequest}
   */
  static fromParams (req, res, authMethod) {
    let options = AuthRequest.requestOptions(req, res)

    switch (authMethod) {
      case PASSWORD_AUTH:
        options.authenticator = PasswordAuthenticator.fromParams(req, options)
        break

      case TLS_AUTH:
        options.authenticator = TlsAuthenticator.fromParams(req, options)
        break

      default:
        options.authenticator = null
        break
    }

    return new LoginRequest(options)
  }

  /**
   * Handles a Login GET request on behalf of a middleware handler, displays
   * the Login page.
   * Usage:
   *
   *   ```
   *   app.get('/login', LoginRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = LoginRequest.fromParams(req, res)

    request.renderForm()
  }

  /**
   * Handles a Login via Username+Password.
   * Errors encountered are displayed on the Login form.
   * Usage:
   *
   *   ```
   *   app.post('/login/password', LoginRequest.loginPassword)
   *   ```
   *
   * @param req
   * @param res
   *
   * @return {Promise}
   */
  static loginPassword (req, res) {
    debug('Logging in via username + password')

    let request = LoginRequest.fromParams(req, res, PASSWORD_AUTH)

    return LoginRequest.login(request)
  }

  /**
   * Handles a Login via WebID-TLS.
   * Errors encountered are displayed on the Login form.
   * Usage:
   *
   *   ```
   *   app.post('/login/tls', LoginRequest.loginTls)
   *   ```
   *
   * @param req
   * @param res
   *
   * @return {Promise}
   */
  static loginTls (req, res) {
    debug('Logging in via WebID-TLS certificate')

    let request = LoginRequest.fromParams(req, res, TLS_AUTH)

    return LoginRequest.login(request)
  }

  /**
   * Performs the login operation -- loads and validates the
   * appropriate user, inits the session with credentials, and redirects the
   * user to continue their auth flow.
   *
   * @param request {LoginRequest}
   *
   * @return {Promise}
   */
  static login (request) {
    return request.authenticator.findValidUser()

      .then(validUser => {

        request.initUserSession(validUser)

        request.redirectPostLogin(validUser)
      })

      .catch(error => { 
         if (request.client_id)
           request.error(error)
         else
           request.http_error(error)
      })
  }

  /**
   * Returns a URL to redirect the user to after login.
   * Either uses the provided `redirect_uri` auth query param, or simply
   * returns the user profile URI if none was provided.
   *
   * @param validUser {UserAccount}
   *
   * @return {string}
   */
  postLoginUrl (validUser) {
    if (this.client_id) {
      // Login request is part of an app's auth flow
      return this.authorizeUrl()
    } else if (validUser) {
      // Login request is a user going to /login in browser
      return this.accountManager.accountUriFor(validUser.username)
    }
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostLogin (validUser) {
    let uri = this.postLoginUrl(validUser);

    //debug(`validUser: ${JSON.stringify(validUser)}`)
    this.response.setHeader('User', validUser.webId);

    if (this.client_id) {
      this.response.redirect(uri)
      debug('Login successful, redirect to uri ', uri)
    } else {
      this.response.writeHead(200, {'Content-Type': 'test/plain'});
      this.response.write(uri);
      this.response.end();
      debug('Login successful, return $HOME uri ', uri)
    }

  }

  /**
   * Renders the login form
   */
  renderForm (error) {
    let authMethod = this.accountManager.authMethod
    let params = Object.assign({}, this.authQueryParams,
      {
        registerUrl: this.registerUrl(),
        returnToUrl: this.returnToUrl,
        enablePassword: this.localAuth.password,
        enableTls: this.localAuth.tls,
        authTls: authMethod === 'tls'
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/login', params)
  }


  http_error (error) {
    this.response.statusCode = 400;
    this.response.statusMessage = error.message;
    this.response.end();
  }
}

module.exports = {
  LoginRequest,
  PASSWORD_AUTH,
  TLS_AUTH
}
