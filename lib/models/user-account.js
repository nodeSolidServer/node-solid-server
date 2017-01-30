'use strict'

class UserAccount {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.username] {string}
   * @param [options.webId] {string}
   * @param [options.name] {string}
   * @param [options.email] {string}
   * @param [options.spkac] {string} Signed Public Key and Challenge from a
   *   browser's `<keygen>` element.
   * @param [options.certificate] {X509Certificate} An X.509v3 RSA certificate,
   *   generated from the `spkac` value passed in during the "create user
   *   account" request.
   */
  constructor (options = {}) {
    this.username = options.username
    this.webId = options.webId
    this.name = options.name
    this.email = options.email
    this.spkac = options.spkac
    this.certificate = options.certificate
  }

  static from (options) {
    return new UserAccount(options)
  }
}

module.exports = UserAccount
