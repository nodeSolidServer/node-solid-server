'use strict'

const url = require('url')

/**
 * Represents a Solid user account (created as a result of Signup, etc).
 */
class UserAccount {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.username] {string}
   * @param [options.webId] {string}
   * @param [options.name] {string}
   * @param [options.email] {string}
   */
  constructor (options = {}) {
    this.username = options.username
    this.webId = options.webId
    this.name = options.name
    this.email = options.email
  }

  /**
   * Factory method, returns an instance of `UserAccount`.
   *
   * @param [options={}] {Object} See `contructor()` docstring.
   *
   * @return {UserAccount}
   */
  static from (options = {}) {
    return new UserAccount(options)
  }

  /**
   * Returns the display name for the account.
   *
   * @return {string}
   */
  get displayName () {
    return this.name || this.username || this.email || 'Solid account'
  }

  /**
   * Returns the id key for the user account (for use with the user store, for
   * example), consisting of the WebID URI minus the protocol and slashes.
   * Usage:
   *
   *   ```
   *   userAccount.webId = 'https://alice.example.com/profile/card#me'
   *   userAccount.id  // -> 'alice.example.com/profile/card#me'
   *   ```
   *
   * @return {string}
   */
  get id () {
    if (!this.webId) { return null }

    let parsed = url.parse(this.webId)
    let id = parsed.host + parsed.pathname
    if (parsed.hash) {
      id += parsed.hash
    }
    return id
  }

  /**
   * Returns the URI of the WebID Profile for this account.
   * Usage:
   *
   *   ```
   *   // userAccount.webId === 'https://alice.example.com/profile/card#me'
   *
   *   userAccount.profileUri  // -> 'https://alice.example.com/profile/card'
   *   ```
   *
   * @return {string|null}
   */
  get profileUri () {
    if (!this.webId) { return null }

    let parsed = url.parse(this.webId)
    // Note that the hash fragment gets dropped
    return parsed.protocol + '//' + parsed.host + parsed.pathname
  }
}

module.exports = UserAccount
