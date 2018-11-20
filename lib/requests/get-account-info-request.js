'use strict'

const AuthRequest = require('./auth-request')
// const debug = require('./../debug').accounts

// class DeleteAccountRequest  {
class GetAccountInfoRequest extends AuthRequest {
  static get (req, res) {
    const request = GetAccountInfoRequest.fromParams(req, res)

    console.log('GET account info', request)
  }

  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager

    return new GetAccountInfoRequest({
      accountManager,
      response: res
    })
  }
}

module.exports = GetAccountInfoRequest
