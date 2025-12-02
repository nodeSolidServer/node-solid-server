import debugModule from '../debug.mjs';
import AuthRequest from './auth-request.mjs';

const debug = debugModule.accounts;

export default class PasswordChangeRequest extends AuthRequest {
  constructor (options) {
    super(options)

    this.token = options.token
    this.returnToUrl = options.returnToUrl

    this.validToken = false

    this.newPassword = options.newPassword
    this.userStore = options.userStore
    this.response = options.response
  }

  static fromParams (req, res) {
    const locals = req.app && req.app.locals ? req.app.locals : {}
    const accountManager = locals.accountManager
    const userStore = locals.oidc ? locals.oidc.users : undefined

    const returnToUrl = this.parseParameter(req, 'returnToUrl')
    const token = this.parseParameter(req, 'token')
    const oldPassword = this.parseParameter(req, 'password')
    const newPassword = this.parseParameter(req, 'newPassword')

    const options = {
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
        if (!this.token) { return false }

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
    const user = this.accountManager.userAccountFrom(tokenContents)

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

  renderForm (error) {
    const params = {
      validToken: this.validToken,
      returnToUrl: this.returnToUrl,
      token: this.token
    }

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/change-password', params)
  }

  renderSuccess () {
    this.response.render('auth/password-changed', { returnToUrl: this.returnToUrl })
  }

  error (error) {
    error.statusCode = error.statusCode || 400

    this.renderForm(error)
  }
}
