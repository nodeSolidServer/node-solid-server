'use strict'

const AuthRequest = require('./auth-request')
const debug = require('./../debug').accounts

class PasswordResetEmailRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   * @param options.accountManager {AccountManager}
   * @param options.response {ServerResponse} express response object
   * @param [options.returnToUrl] {string}
   * @param [options.username] {string} Username / account name (e.g. 'alice')
   */
  constructor (options) {
    super(options)

    this.returnToUrl = options.returnToUrl
    this.username = options.username
  }

  /**
   * Factory method, returns an initialized instance of PasswordResetEmailRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {PasswordResetEmailRequest}
   */
  static fromParams (req, res) {
    const locals = req.app.locals
    const accountManager = locals.accountManager

    const returnToUrl = this.parseParameter(req, 'returnToUrl')
    const username = this.parseParameter(req, 'username')

    const options = {
      accountManager,
      returnToUrl,
      username,
      response: res
    }

    return new PasswordResetEmailRequest(options)
  }

  /**
   * Handles a Reset Password GET request on behalf of a middleware handler.
   * Usage:
   *
   *   ```
   *   app.get('/password/reset', PasswordResetEmailRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = PasswordResetEmailRequest.fromParams(req, res)

    request.renderForm()
  }

  /**
   * Handles a Reset Password POST request on behalf of a middleware handler.
   * Usage:
   *
   *   ```
   *   app.get('/password/reset', PasswordResetEmailRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static post (req, res) {
    const request = PasswordResetEmailRequest.fromParams(req, res)

    debug(`User '${request.username}' requested to be sent a password reset email`)

    return PasswordResetEmailRequest.handlePost(request)
  }

  /**
   * Performs a 'send me a password reset email' request operation, after the
   * user has entered an email into the reset form.
   *
   * @param request {PasswordResetEmailRequest}
   *
   * @return {Promise}
   */
  static handlePost (request) {
    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.loadUser())
      .then(userAccount => request.sendResetLink(userAccount))
      .then(() => request.resetLinkMessage())
      .catch(error => request.error(error))
  }

  /**
   * Validates the request parameters, and throws an error if any
   * validation fails.
   *
   * @throws {Error}
   */
  validate () {
    if (this.accountManager.multiuser && !this.username) {
      throw new Error('Username required')
    }
  }

  /**
   * Returns a user account instance for the submitted username.
   *
   * @throws {Error} Rejects if user account does not exist for the username
   *
   * @returns {Promise<UserAccount>}
   */
  loadUser () {
    const username = this.username

    return this.accountManager.accountExists(username)
      .then(exists => {
        if (!exists) {
          // For security reasons, avoid leaking error information
          // See: https://github.com/nodeSolidServer/node-solid-server/issues/1770
          this.accountManager.verifyEmailDependencies()
          return this.resetLinkMessage()
        }

        const userData = { username }

        return this.accountManager.userAccountFrom(userData)
      })
  }

  /**
   * Loads the account recovery email for a given user and sends out a
   * password request email.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  sendResetLink (userAccount) {
    const accountManager = this.accountManager

    return accountManager.loadAccountRecoveryEmail(userAccount)
      .then(recoveryEmail => {
        userAccount.email = recoveryEmail

        debug('Sending recovery email to:', recoveryEmail)

        return accountManager
          .sendPasswordResetEmail(userAccount, this.returnToUrl)
      })
  }

  /**
   * Renders the 'send password reset link' form along with the provided error.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error) {
    const res = this.response

    debug(error)

    const params = {
      error: error.message,
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    res.status(error.statusCode || 400)

    res.render('auth/reset-password', params)
  }

  /**
   * Renders the 'send password reset link' form
   */
  renderForm () {
    const params = {
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    this.response.render('auth/reset-password', params)
  }

  /**
   * Displays the 'your reset link has been sent' success message view
   */
  resetLinkMessage () {
    this.response.render('auth/reset-link-sent')
  }
}

module.exports = PasswordResetEmailRequest
