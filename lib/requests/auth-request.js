'use strict'

class AuthRequest {
  static parseParameter (req, parameter) {
    let query = req.query || {}
    let body = req.body || {}
    let params = req.params || {}

    return query[parameter] || body[parameter] || params[parameter] || null
  }
}

module.exports = AuthRequest
