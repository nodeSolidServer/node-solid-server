'use strict'

const debug = require('./../debug').authentication

class LogoutRequest {
  /**
   * @constructor
   * @param options
   * @param options.request {IncomingRequest} req
   * @param options.response {ServerResponse} res
   */
  constructor (options) {
    this.request = options.request
    this.response = options.response
  }

  static handle (req, res) {
    return Promise.resolve()
      .then(() => {
        let request = LogoutRequest.fromParams(req, res)

        return LogoutRequest.logout(request)
      })
  }

  static fromParams (req, res) {
    let options = {
      request: req,
      response: res
    }

    return new LogoutRequest(options)
  }

  static logout (request) {
    debug(`Logging out user ${request.request.session.userId}`)

    request.clearUserSession()
    request.redirectToGoodbye()
  }

  clearUserSession () {
    let session = this.request.session

    session.accessToken = ''
    session.refreshToken = ''
    session.userId = ''
    session.identified = false
    session.subject = ''
  }

  redirectToGoodbye () {
    this.response.redirect('/goodbye')
  }
}

module.exports = LogoutRequest
