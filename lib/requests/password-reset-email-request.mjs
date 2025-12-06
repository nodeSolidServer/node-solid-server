import AuthRequest from './auth-request.mjs'
import debugModule from './../debug.mjs'

const debug = debugModule.accounts

export default class PasswordResetEmailRequest extends AuthRequest {
  constructor (options) {
    super(options)

    this.accountManager = options.accountManager
    this.userStore = options.userStore
    this.returnToUrl = options.returnToUrl
    this.username = options.username
    this.response = options.response
  }

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
      .then(() => request.resetLinkMessage())
      .catch(error => request.error(error))
  }

  validate () {
    if (this.accountManager.multiuser && !this.username) {
      throw new Error('Username required')
    }
  }

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

  renderForm () {
    const params = {
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    this.response.render('auth/reset-password', params)
  }

  resetLinkMessage () {
    this.response.render('auth/reset-link-sent')
  }
}
