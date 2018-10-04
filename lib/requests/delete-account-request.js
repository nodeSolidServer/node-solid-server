'use strict'

const AuthRequest = require('./auth-request')
const debug = require('./../debug').accounts

// class DeleteAccountRequest  {
class DeleteAccountRequest extends AuthRequest {
  constructor (options) {
    super(options)

    this.username = options.username
  }

  /**
   * Calls the appropriate form to display to the user.
   * Serves as an error handler for this request workflow.
   *
   * @param error {Error}
   */
  error (error) {
    error.statusCode = error.statusCode || 400

    this.renderForm(error)
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

  /**
   * Renders the Delete form
   */
  renderForm (error) {
    const params = {
      error,
      multiuser: this.accountManager.multiuser
    }

    this.response.render('account/delete', params)
  }

  /**
   * Displays the 'your reset link has been sent' success message view
   */
  renderSuccess () {
    this.response.render('account/delete-link-sent')
  }

  /**
   * Loads the account recovery email for a given user and sends out a
   * password request email.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  sendDeleteLink (userAccount) {
    let accountManager = this.accountManager

    return accountManager.loadAccountRecoveryEmail(userAccount)
      .then(recoveryEmail => {
        userAccount.email = recoveryEmail

        debug('Sending delete account email to:', recoveryEmail)

        return accountManager.sendDeleteAccountEmail(userAccount)
      })
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

  static post (req, res) {
    const request = DeleteAccountRequest.fromParams(req, res)

    debug(`User '${request.username}' requested to be sent a delete account email`)

    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.loadUser())
      .then(userAccount => request.sendDeleteLink(userAccount))
      .then(() => request.renderSuccess())
      .catch(error => request.error(error))
  }

  static get (req, res) {
    let request = DeleteAccountRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.renderForm())
      .catch(error => request.error(error))
  }

  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager
    let username = this.parseParameter(req, 'username')

    let options = {
      accountManager,
      response: res,
      username
    }

    return new DeleteAccountRequest(options)
    // let options = AuthRequest.requestOptions(req, res)
    //
    // let locals = req.app.locals
    // let accountManager = locals.accountManager
    //
    // let body = req.body || {}
    //
    // options.username = body.username
    //
    // if (options.username) {
    //   options.userAccount = accountManager.userAccountFrom(body)
    // }
  }
}

module.exports = DeleteAccountRequest
