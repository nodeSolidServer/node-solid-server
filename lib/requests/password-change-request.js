'use strict'

const AuthRequest = require('./auth-request')
const debug = require('./../debug').accounts

class PasswordChangeRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   * @param options.accountManager {AccountManager}
   * @param options.userStore {UserStore}
   * @param options.response {ServerResponse} express response object
   * @param [options.token] {string} One-time reset password token (from email)
   * @param [options.returnToUrl] {string}
   * @param [options.newPassword] {string} New password to save
   */
  constructor (options) {
    super()
    this.accountManager = options.accountManager
    this.userStore = options.userStore
    this.response = options.response

    this.token = options.token
    this.returnToUrl = options.returnToUrl

    this.validToken = false

    this.newPassword = options.newPassword
  }

  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager
    let userStore = locals.oidc.users

    let returnToUrl = this.parseParameter(req, 'returnToUrl')
    let token = this.parseParameter(req, 'token')
    let oldPassword = this.parseParameter(req, 'password')
    let newPassword = this.parseParameter(req, 'newPassword')

    let options = {
      accountManager,
      userStore,
      returnToUrl,
      token,
      oldPassword,
      newPassword,
      response: res
    }

    return new PasswordChangeRequest(options)
  }

  /**
   * Handles a Change Password GET request on behalf of a middleware handler.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static get (req, res) {
    const request = PasswordChangeRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.validateToken())
      .then(() => request.renderForm())
      .catch(error => request.error(error))
  }

  static post (req, res) {
    const request = PasswordChangeRequest.fromParams(req, res)

    return PasswordChangeRequest.handlePost(request)
  }

  static handlePost (request) {
    return Promise.resolve()
      .then(() => request.validatePost())
      .then(() => request.validateToken())
      .then(tokenContents => request.changePassword(tokenContents))
      .then(() => request.renderSuccess())
      .catch(error => request.error(error))
  }

  validatePost () {
    if (!this.newPassword) {
      throw new Error('Please enter a new password')
    }
  }

  validateToken () {
    return Promise.resolve()
      .then(() => {
        if (!this.token) { return }

        return this.accountManager.validateResetToken(this.token)
      })
      .then(validToken => {
        if (validToken) {
          this.validToken = true
        }

        return validToken
      })
      .catch(error => {
        this.token = null
        throw error
      })
  }

  changePassword (tokenContents) {
    let user = this.accountManager.userAccountFrom(tokenContents)

    debug('Changing password for user:', user.webId)

    return this.userStore.findUser(user.id)
      .then(userStoreEntry => {
        if (userStoreEntry) {
          return this.userStore.updatePassword(user, this.newPassword)
        } else {
          return this.userStore.createUser(user, this.newPassword)
        }
      })
  }

  error (error) {
    this.renderForm(error)
  }

  renderForm (error) {
    let params = {
      validToken: this.validToken,
      returnToUrl: this.returnToUrl,
      token: this.token
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode || 400)
    }

    this.response.render('auth/change-password', params)
  }

  renderSuccess () {
    this.response.render('auth/password-changed', { returnToUrl: this.returnToUrl })
  }
}

module.exports = PasswordChangeRequest
