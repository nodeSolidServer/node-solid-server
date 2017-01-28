'use strict'

const url = require('url')

const DEFAULT_PORT = 8443
const DEFAULT_URI = 'https://localhost:8443'

class SolidHost {
  /**
   * @constructor
   * @param [options={}]
   * @param [options.port=DEFAULT_PORT] {number}
   * @param [options.serverUri=DEFAULT_URI] {string}
   */
  constructor (options = {}) {
    this.port = options.port || DEFAULT_PORT
    this.serverUri = options.serverUri || DEFAULT_URI

    this.parsedUri = url.parse(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname
  }

  static fromConfig (options = {}) {
    return new SolidHost(options)
  }

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
module.exports.DEFAULT_PORT = DEFAULT_PORT
module.exports.DEFAULT_URI = DEFAULT_URI
