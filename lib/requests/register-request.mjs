import debugModule from '../debug.mjs'

const debug = debugModule.accounts

export default class RegisterRequest {
  constructor (options) {
    this.accountManager = options.accountManager
    this.userAccount = options.userAccount
    this.response = options.response
  }

  static handle (req, res, accountManager) {
    let request
    try {
      request = RegisterRequest.fromParams(req, res, accountManager)
    } catch (error) {
      return Promise.reject(error)
    }
    return RegisterRequest.register(request)
  }

  static fromParams (req, res, accountManager) {
    const userAccount = accountManager.userAccountFrom(req.body)
    if (!userAccount) {
      const error = new Error('User account information is required')
      error.status = 400
      throw error
    }
    const options = { accountManager, userAccount, response: res }
    return new RegisterRequest(options)
  }

  static register (request) {
    const { accountManager, userAccount } = request
    return accountManager.register(userAccount)
      .catch(err => {
        err.status = 400
        err.message = 'Error registering user: ' + err.message
        throw err
      })
      .then(() => {
        request.sendResponse()
      })
  }

  sendResponse () {
    const { response, userAccount } = this
    response.set('User', userAccount.webId)
    response.status(201)
    response.send({ message: 'User registered successfully' })
  }
}
