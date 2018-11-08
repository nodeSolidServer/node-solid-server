'use strict'

const AuthRequest = require('./auth-request')
const debug = require('./../debug').accounts
const fs = require('fs-extra')

class DeleteAccountConfirmRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   * @param options.accountManager {AccountManager}
   * @param options.userStore {UserStore}
   * @param options.response {ServerResponse} express response object
   * @param [options.token] {string} One-time reset password token (from email)
   */
  constructor (options) {
    super(options)

    this.token = options.token
    this.validToken = false
  }

  /**
   * Factory method, returns an initialized instance of DeleteAccountConfirmRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {DeleteAccountConfirmRequest}
   */
  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager
    let userStore = locals.oidc.users

    let token = this.parseParameter(req, 'token')

    let options = {
      accountManager,
      userStore,
      token,
      response: res
    }

    return new DeleteAccountConfirmRequest(options)
  }

  /**
   * Handles a Change Password GET request on behalf of a middleware handler.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {Promise}
   */
  static async get (req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res)

    try {
      await request.validateToken()
      return request.renderForm()
    } catch (error) {
      return request.error(error)
    }
  }

  /**
   * Handles a Change Password POST request on behalf of a middleware handler.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   *
   * @return {Promise}
   */
  static post (req, res) {
    const request = DeleteAccountConfirmRequest.fromParams(req, res)

    return DeleteAccountConfirmRequest.handlePost(request)
  }

  /**
   * Performs the 'Change Password' operation, after the user submits the
   * password change form. Validates the parameters (the one-time token,
   * the new password), changes the password, and renders the success view.
   *
   * @param request {DeleteAccountConfirmRequest}
   *
   * @return {Promise}
   */
  static async handlePost (request) {
    try {
      const tokenContents = await request.validateToken()
      await request.deleteAccount(tokenContents)
      return request.renderSuccess()
    } catch (error) {
      return request.error(error)
    }
  }

  /**
   * Validates the one-time Password Reset token that was emailed to the user.
   * If the token service has a valid token saved for the given key, it returns
   * the token object value (which contains the user's WebID URI, etc).
   * If no token is saved, returns `false`.
   *
   * @return {Promise<Object|false>}
   */
  async validateToken () {
    try {
      if (!this.token) {
        return false
      }
      const validToken = await this.accountManager.validateDeleteToken(this.token)
      if (validToken) {
        this.validToken = true
      }
      return validToken
    } catch (error) {
      this.token = null
      throw error
    }
  }

  /**
   * Removes the user's account and all their data from the store.
   *
   * @param tokenContents {Object}
   *
   * @return {Promise}
   */
  async deleteAccount (tokenContents) {
    let user = this.accountManager.userAccountFrom(tokenContents)
    let accountDir = this.accountManager.accountDirFor(user.username)

    debug('Preparing removal of account for user:', user)

    await this.userStore.deleteUser(user)
    await fs.remove(accountDir)
    debug('Removed user' + user.username)
  }

  /**
   * Renders the 'change password' form.
   *
   * @param [error] {Error} Optional error to display
   */
  renderForm (error) {
    let params = {
      validToken: this.validToken,
      token: this.token
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('account/delete-confirm', params)
  }

  /**
   * Displays the 'password has been changed' success view.
   */
  renderSuccess () {
    this.response.render('account/account-deleted')
  }
}

module.exports = DeleteAccountConfirmRequest
