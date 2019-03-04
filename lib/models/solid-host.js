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
   * @param [options.serverUri] {string} Fully qualified URI that this Solid
   *   server is listening on, e.g. `https://solid.community`
   * @param [options.live] {boolean} Whether to turn on WebSockets / LDP live
   * @param [options.root] {string} Path to root data directory
   * @param [options.multiuser] {boolean} Multiuser mode
   * @param [options.webid] {boolean} Enable WebID-related functionality
   *  (account creation and authentication)
   */
  constructor (options = {}) {
    this.port = options.port || defaults.port
    this.serverUri = options.serverUri || defaults.serverUri

    this.parsedUri = url.parse(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname
    this.live = options.live
    this.root = options.root
    this.multiuser = options.multiuser
    this.webid = options.webid
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
   * Composes and returns an account URI for a given username, in multi-user mode.
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
  /**
   * Determines whether the given user is allowed to restore a session
   * from the given origin.
   *
   * @param userId {?string}
   * @param origin {?string}
   * @return {boolean}
   */
  allowsSessionFor (userId, origin, trustedOrigins) {
    // Allow no user or an empty origin
    if (!userId || !origin) return true
    // Allow the server and subdomains
    const originHost = getHostName(origin)
    const serverHost = getHostName(this.serverUri)
    if (originHost === serverHost) return true
    if (originHost.endsWith('.' + serverHost)) return true
    // Allow the user's own domain
    const userHost = getHostName(userId)
    if (originHost === userHost) return true
    if (trustedOrigins.includes(origin)) return true
    return false
  }

  /**
   * Returns the /authorize endpoint URL object (used in login requests, etc).
   *
   * @return {URL}
   */
  get authEndpoint () {
    let authUrl = url.resolve(this.serverUri, '/authorize')
    return url.parse(authUrl)
  }

  /**
   * Returns a cookie domain, based on the current host's serverUri.
   *
   * @return {string|null}
   */
  get cookieDomain () {
    let cookieDomain = null

    if (this.hostname.split('.').length > 1) {
      // For single-level domains like 'localhost', do not set the cookie domain
      // See section on 'domain' attribute at https://curl.haxx.se/rfc/cookie_spec.html
      cookieDomain = '.' + this.hostname
    }

    return cookieDomain
  }
}

function getHostName (url) {
  const match = url.match(/^\w+:\/*([^/]+)/)
  return match ? match[1] : ''
}

module.exports = SolidHost
