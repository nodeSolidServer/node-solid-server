import AuthRequest from './auth-request.mjs'
import debugModule from '../debug.mjs'

const debug = debugModule.accounts

export default class DeleteAccountRequest extends AuthRequest {
  constructor (options) {
    super(options)
    this.username = options.username
  }

  error (error) {
    error.statusCode = error.statusCode || 400
    this.renderForm(error)
  }

  async loadUser () {
    const username = this.username
    return this.accountManager.accountExists(username)
      .then(exists => {
        if (!exists) {
          throw new Error('Account not found for that username')
        }
        const userData = { username }
        return this.accountManager.userAccountFrom(userData)
      })
  }

  renderForm (error) {
    this.response.render('account/delete', {
      error,
      multiuser: this.accountManager.multiuser
    })
  }

  renderSuccess () {
    this.response.render('account/delete-link-sent')
  }

  async sendDeleteLink (userAccount) {
    const accountManager = this.accountManager
    const recoveryEmail = await accountManager.loadAccountRecoveryEmail(userAccount)
    userAccount.email = recoveryEmail
    debug('Preparing delete account email to:', recoveryEmail)
    return accountManager.sendDeleteAccountEmail(userAccount)
  }

  validate () {
    if (this.accountManager.multiuser && !this.username) {
      throw new Error('Username required')
    }
  }

  static async post (req, res) {
    const request = DeleteAccountRequest.fromParams(req, res)
    debug(`User '${request.username}' requested to be sent a delete account email`)
    return DeleteAccountRequest.handlePost(request)
  }

  static async handlePost (request) {
    try {
      request.validate()
      const userAccount = await request.loadUser()
      await request.sendDeleteLink(userAccount)
      return request.renderSuccess()
    } catch (error) {
      return request.error(error)
    }
  }

  static get (req, res) {
    const request = DeleteAccountRequest.fromParams(req, res)
    request.renderForm()
  }

  static fromParams (req, res) {
    const locals = req.app.locals
    const accountManager = locals.accountManager
    const username = this.parseParameter(req, 'username')
    const options = { accountManager, response: res, username }
    return new DeleteAccountRequest(options)
  }
}
