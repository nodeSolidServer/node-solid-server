import debugModule from '../debug.mjs'

const debug = debugModule.accounts

export default class PasswordResetRequest {
  constructor (options) {
    this.accountManager = options.accountManager
    this.email = options.email
    this.response = options.response
  }

  static handle (req, res, accountManager) {
    let request
    try {
      request = PasswordResetRequest.fromParams(req, res, accountManager)
    } catch (error) {
      return Promise.reject(error)
    }
    return PasswordResetRequest.resetPassword(request)
  }

  static fromParams (req, res, accountManager) {
    const email = req.body.email
    if (!email) {
      const error = new Error('Email is required for password reset')
      error.status = 400
      throw error
    }
    const options = { accountManager, email, response: res }
    return new PasswordResetRequest(options)
  }

  static resetPassword (request) {
    const { accountManager, email } = request
    return accountManager.resetPassword(email)
      .catch(err => {
        err.status = 400
        err.message = 'Error resetting password: ' + err.message
        throw err
      })
      .then(() => {
        request.sendResponse()
      })
  }

  sendResponse () {
    const { response } = this
    response.status(200)
    response.send({ message: 'Password reset email sent' })
  }
}
