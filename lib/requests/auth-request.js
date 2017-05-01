'use strict'

/**
 * Base authentication request (used for login and password reset workflows).
 */
class AuthRequest {
  /**
   * Extracts a given parameter from the request - either from a GET query param,
   * a POST body param, or an express registered `/:param`.
   * Usage:
   *
   *   ```
   *   AuthRequest.parseParameter(req, 'client_id')
   *   // -> 'client123'
   *   ```
   *
   * @param req {IncomingRequest}
   * @param parameter {string} Parameter key
   *
   * @return {string|null}
   */
  static parseParameter (req, parameter) {
    let query = req.query || {}
    let body = req.body || {}
    let params = req.params || {}

    return query[parameter] || body[parameter] || params[parameter] || null
  }
}

module.exports = AuthRequest
