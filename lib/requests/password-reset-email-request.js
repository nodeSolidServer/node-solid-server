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
    super()
    this.accountManager = options.accountManager
    this.response = options.response
    this.returnToUrl = options.returnToUrl
    this.username = options.username
  }

  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager

    let returnToUrl = this.parseParameter(req, 'returnToUrl')
    let username = this.parseParameter(req, 'username')

    let options = {
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

  static post (req, res) {
    const request = PasswordResetEmailRequest.fromParams(req, res)

    debug(`User '${request.username}' requested to be sent a password reset email`)

    return PasswordResetEmailRequest.handlePost(request)
  }

  static handlePost (request) {
    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.loadUser())
      .then(userAccount => request.sendResetLink(userAccount))
      .then(() => request.renderSuccess())
      .catch(error => request.error(error))
  }

  validate () {
    if (this.accountManager.multiUser && !this.username) {
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
    let username = this.username

    return this.accountManager.accountExists(username)
      .then(exists => {
        if (!exists) {
          throw new Error('Account not found for that username')
        }

        let userData = { username }

        return this.accountManager.userAccountFrom(userData)
      })
  }

  sendResetLink (userAccount) {
    let accountManager = this.accountManager

    return accountManager.loadAccountRecoveryEmail(userAccount)
      .then(recoveryEmail => {
        userAccount.email = recoveryEmail

        debug('Sending recovery email to:', recoveryEmail)

        return accountManager
          .sendPasswordResetEmail(userAccount, this.returnToUrl)
      })
  }

  error (error) {
    let res = this.response

    debug(error)

    let params = {
      error: error.message,
      returnToUrl: this.returnToUrl
    }

    res.status(error.statusCode || 400)

    res.render('auth/reset-password', params)
  }

  renderForm () {
    let params = {
      returnToUrl: this.returnToUrl,
      multiUser: this.accountManager.multiUser
    }

    this.response.render('auth/reset-password', params)
  }

  renderSuccess () {
    this.response.render('auth/reset-link-sent')
  }
}

module.exports = PasswordResetEmailRequest
