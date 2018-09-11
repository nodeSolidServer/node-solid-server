'use strict'

const debug = require('./../debug').authentication
const validUrl = require('valid-url')
const webid = require('webid/tls')
const provider = require('@solid/oidc-auth-manager/src/preferred-provider')
const { domainMatches } = require('@solid/oidc-auth-manager/src/oidc-manager')

/**
 * Abstract Authenticator class, representing a local login strategy.
 * To subclass, implement `fromParams()` and `findValidUser()`.
 * Used by the `LoginRequest` handler class.
 *
 * @abstract
 * @class Authenticator
 */
class Authenticator {
  constructor (options) {
    this.accountManager = options.accountManager
  }

  /**
   * @param req {IncomingRequest}
   * @param options {Object}
   */
  static fromParams (req, options) {
    throw new Error('Must override method')
  }

  /**
   * @returns {Promise<UserAccount>}
   */
  findValidUser () {
    throw new Error('Must override method')
  }
}

/**
 * Authenticates user via Username+Password.
 */
class PasswordAuthenticator extends Authenticator {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.username] {string} Unique identifier submitted by user
   *   from the Login form. Can be one of:
   *   - An account name (e.g. 'alice'), if server is in Multi-User mode
   *   - A WebID URI (e.g. 'https://alice.example.com/#me')
   *
   * @param [options.password] {string} Plaintext password as submitted by user
   *
   * @param [options.userStore] {UserStore}
   *
   * @param [options.accountManager] {AccountManager}
   */
  constructor (options) {
    super(options)

    this.userStore = options.userStore
    this.username = options.username
    this.password = options.password
  }

  /**
   * Factory method, returns an initialized instance of PasswordAuthenticator
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param [req.body={}] {Object}
   * @param [req.body.username] {string}
   * @param [req.body.password] {string}
   *
   * @param options {Object}
   *
   * @param [options.accountManager] {AccountManager}
   * @param [options.userStore] {UserStore}
   *
   * @return {PasswordAuthenticator}
   */
  static fromParams (req, options) {
    let body = req.body || {}

    options.username = body.username
    options.password = body.password

    return new PasswordAuthenticator(options)
  }

  /**
   * Ensures required parameters are present,
   * and throws an error if not.
   *
   * @throws {Error} If missing required params
   */
  validate () {
    let error

    if (!this.username) {
      error = new Error('Username required')
      error.statusCode = 400
      throw error
    }

    if (!this.password) {
      error = new Error('Password required')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Loads a user from the user store, and if one is found and the
   * password matches, returns a `UserAccount` instance for that user.
   *
   * @throws {Error} If failures to load user are encountered
   *
   * @return {Promise<UserAccount>}
   */
  findValidUser () {
    let error
    let userOptions

    return Promise.resolve()
      .then(() => this.validate())
      .then(() => {
        if (validUrl.isUri(this.username)) {
          // A WebID URI was entered into the username field
          userOptions = { webId: this.username }
        } else {
          // A regular username
          userOptions = { username: this.username }
        }

        let user = this.accountManager.userAccountFrom(userOptions)

        debug(`Attempting to login user: ${user.id}`)

        return this.userStore.findUser(user.id)
      })
      .then(foundUser => {
        if (!foundUser) {
          error = new Error('No user found for that username')
          error.statusCode = 400
          throw error
        }

        return this.userStore.matchPassword(foundUser, this.password)
      })
      .then(validUser => {
        if (!validUser) {
          error = new Error('User found but no password match')
          error.statusCode = 400
          throw error
        }

        debug('User found, password matches')

        return this.accountManager.userAccountFrom(validUser)
      })
  }
}

/**
 * Authenticates a user via a WebID-TLS client side certificate.
 */
class TlsAuthenticator extends Authenticator {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.accountManager] {AccountManager}
   *
   * @param [options.connection] {Socket} req.connection
   */
  constructor (options) {
    super(options)

    this.connection = options.connection
  }

  /**
   * Factory method, returns an initialized instance of TlsAuthenticator
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param req.connection {Socket}
   *
   * @param options {Object}
   * @param [options.accountManager] {AccountManager}
   *
   * @return {TlsAuthenticator}
   */
  static fromParams (req, options) {
    options.connection = req.connection

    return new TlsAuthenticator(options)
  }

  /**
   * Requests a client certificate from the current TLS connection via
   * renegotiation, extracts and verifies the user's WebID URI,
   * and makes sure that WebID is hosted on this server.
   *
   * @throws {Error} If error is encountered extracting the WebID URI from
   *   certificate, or if the user's account is hosted by a remote system.
   *
   * @return {Promise<UserAccount>}
   */
  findValidUser () {
    return this.renegotiateTls()

      .then(() => this.getCertificate())

      .then(cert => this.extractWebId(cert))

      .then(webId => this.loadUser(webId))
  }

  /**
   * Renegotiates the current TLS connection to ask for a client certificate.
   *
   * @throws {Error}
   *
   * @returns {Promise}
   */
  renegotiateTls () {
    let connection = this.connection

    return new Promise((resolve, reject) => {
      // Typically, certificates for WebID-TLS are not signed or self-signed,
      // and would hence be rejected by Node.js for security reasons.
      // However, since WebID-TLS instead dereferences the profile URL to validate ownership,
      // we can safely skip the security check.
      connection.renegotiate({ requestCert: true, rejectUnauthorized: false }, (error) => {
        if (error) {
          debug('Error renegotiating TLS:', error)

          return reject(error)
        }

        resolve()
      })
    })
  }

  /**
   * Requests and returns a client TLS certificate from the current connection.
   *
   * @throws {Error} If no certificate is presented, or if it is empty.
   *
   * @return {Promise<X509Certificate|null>}
   */
  getCertificate () {
    let certificate = this.connection.getPeerCertificate()

    if (!certificate || !Object.keys(certificate).length) {
      debug('No client certificate detected')

      throw new Error('No client certificate detected. ' +
        '(You may need to restart your browser to retry.)')
    }

    return certificate
  }

  /**
   * Extracts (and verifies) the WebID URI from a client certificate.
   *
   * @param certificate {X509Certificate}
   *
   * @return {Promise<string>} WebID URI
   */
  extractWebId (certificate) {
    return new Promise((resolve, reject) => {
      this.verifyWebId(certificate, (error, webId) => {
        if (error) {
          debug('Error processing certificate:', error)

          return reject(error)
        }

        resolve(webId)
      })
    })
  }

  /**
   * Performs WebID-TLS verification (requests the WebID Profile from the
   * WebID URI extracted from certificate, and makes sure the public key
   * from the profile matches the key from certificate).
   *
   * @param certificate {X509Certificate}
   * @param callback {Function} Gets invoked with signature `callback(error, webId)`
   */
  verifyWebId (certificate, callback) {
    debug('Verifying WebID URI')

    webid.verify(certificate, callback)
  }

  discoverProviderFor (webId) {
    return provider.discoverProviderFor(webId)
  }

  /**
   * Returns a user account instance for a given Web ID.
   *
   * @param webId {string}
   *
   * @return {UserAccount}
   */
  loadUser (webId) {
    const serverUri = this.accountManager.host.serverUri

    if (domainMatches(serverUri, webId)) {
      // This is a locally hosted Web ID
      return this.accountManager.userAccountFrom({ webId })
    } else {
      debug(`WebID URI ${JSON.stringify(webId)} is not a local account, using it as an external WebID`)

      return this.accountManager.userAccountFrom({ webId, username: webId, externalWebId: true })
    }
  }
}

module.exports = {
  Authenticator,
  PasswordAuthenticator,
  TlsAuthenticator
}
