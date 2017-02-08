'use strict'

const url = require('url')
const defaults = require('../../config/defaults')

/**
 * Represents the URI that a Solid server is installed on, and manages user
 * account URI creation.
 *
 * @class SolidHost
 */
class SolidHost {
  /**
   * @constructor
   * @param [options={}]
   * @param [options.port] {number}
   * @param [options.serverUri] {string}
   */
  constructor (options = {}) {
    this.port = options.port || defaults.DEFAULT_PORT
    this.serverUri = options.serverUri || defaults.DEFAULT_URI

    this.parsedUri = url.parse(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname
  }

  /**
   * Factory method, returns an instance of `SolidHost`.
   *
   * @param [options={}] {Object} See `constructor()` docstring.
   *
   * @return {SolidHost}
   */
  static from (options = {}) {
    return new SolidHost(options)
  }

  /**
   * Composes and returns an account URI for a given username, in multiUser mode.
   * Usage:
   *
   *   ```
   *   // host.serverUri === 'https://example.com'
   *
   *   host.accountUriFor('alice')  // -> 'https://alice.example.com'
   *   ```
   *
   * @param accountName {string}
   *
   * @throws {TypeError} If no accountName given, or if serverUri not initialized
   * @return {string}
   */
  accountUriFor (accountName) {
    if (!accountName) {
      throw TypeError('Cannot construct uri for blank account name')
    }
    if (!this.parsedUri) {
      throw TypeError('Cannot construct account, host not initialized with serverUri')
    }
    return this.parsedUri.protocol + '//' + accountName + '.' + this.host
  }
}

module.exports = SolidHost
