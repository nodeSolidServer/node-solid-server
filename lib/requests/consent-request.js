'use strict'

const debug = require('./../debug').authentication

const AuthRequest = require('./auth-request')

const url = require('url')

/**
 * Models a local Login request
 */
class ConsentRequest extends AuthRequest {
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
    this.authMethod = options.authMethod
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
  static fromParams (req, res) {
    let options = AuthRequest.requestOptions(req, res)

    return new ConsentRequest(options)
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
  static async get (req, res) {
    const request = ConsentRequest.fromParams(req, res)
    const appOrigin = request.getAppOrigin()
    // Check if is already registered or is data browser
    if (
      appOrigin === req.app.locals.ldp.serverUri ||
      await request.isAppRegistered(appOrigin, request.authQueryParams.web_id)
    ) {
      request.redirectPostConsent()
    } else {
      request.renderForm(null, req)
    }
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
  static async giveConsent (req, res) {
    let accessModes = []
    let consented = false
    if (req.body) {
      accessModes = req.body.access_mode
      consented = req.body.consent
    }

    let request = ConsentRequest.fromParams(req, res)
    const appOrigin = request.getAppOrigin()
    debug('Providing consent for app sharing')

    if (consented) {
      await request.registerApp(appOrigin, accessModes, request.authQueryParams.web_id)
    }

    // Redirect once that's all done
    return request.authenticator.findValidUser()
      .then(validUser => {
        request.initUserSession(validUser)
        request.redirectPostConsent(validUser)
      })

      .catch(error => request.error(error))
  }

  getAppOrigin () {
    const parsed = url.parse(this.authQueryParams.redirect_uri)
    return `${parsed.protocol}//${parsed.host}`
  }

  async isAppRegistered (appOrigin, webId) {
    return false
  }

  async registerApp (appOrigin, accessModes, webId) {
    return
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
  postConsentUrl () {
    return this.authorizeUrl()
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostConsent () {
    let uri = this.postConsentUrl()
    debug('Login successful, redirecting to ', uri)
    this.response.redirect(uri)
  }

  /**
   * Renders the login form
   */
  renderForm (error, req) {
    let queryString = req && req.url && req.url.replace(/[^?]+\?/, '') || ''
    let params = Object.assign({}, this.authQueryParams,
      {
        registerUrl: this.registerUrl(),
        returnToUrl: this.returnToUrl,
        enablePassword: this.localAuth.password,
        enableTls: this.localAuth.tls,
        tlsUrl: `/login/tls?${encodeURIComponent(queryString)}`
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/consent', params)
  }
}

module.exports = {
  ConsentRequest
}
