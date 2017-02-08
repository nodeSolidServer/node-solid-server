'use strict'

const WebIdTlsCertificate = require('../models/webid-tls-certificate')

/**
 * Represents a 'create new user account' http request (a POST to the
 * `/accounts/api/new` endpoint).
 *
 * Intended just for browser-based requests; to create new user accounts from
 * a command line, use the `AccountManager` class directly.
 *
 * This is an abstract class, subclasses are created (for example
 * `CreateTlsAccountRequest`) depending on which Authentication mode the server
 * is running in.
 *
 * @class CreateAccountRequest
 */
class CreateAccountRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.userAccount] {UserAccount}
   * @param [options.session] {Session} e.g. req.session
   * @param [options.response] {HttpResponse}
   */
  constructor (options) {
    this.accountManager = options.accountManager
    this.userAccount = options.userAccount
    this.session = options.session
    this.response = options.response
  }

  /**
   * Factory method, creates an appropriate CreateAccountRequest subclass from
   * an HTTP request (browser form submit), depending on the authn method.
   *
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError} If required parameters are missing (`userAccountFrom()`),
   *   or it encounters an unsupported authentication scheme.
   *
   * @return {CreateAccountRequest|CreateTlsAccountRequest}
   */
  static fromParams (req, res, accountManager) {
    let userAccount = accountManager.userAccountFrom(req.body)

    let options = {
      accountManager,
      userAccount,
      session: req.session,
      response: res
    }

    switch (accountManager.authMethod) {
      case 'tls':
        options.spkac = req.body.spkac
        return new CreateTlsAccountRequest(options)
      default:
        throw new TypeError('Unsupported authentication scheme')
    }
  }

  /**
   * Creates an account for a given user (from a POST to `/api/accounts/new`)
   *
   * @throws {Error} An http 400 error if an account already exists
   *
   * @return {Promise<UserAccount>} Resolves with newly created account instance
   */
  createAccount () {
    let userAccount = this.userAccount
    let accountManager = this.accountManager

    return Promise.resolve(userAccount)
      .then(this.cancelIfAccountExists.bind(this))
      .then(this.generateCredentials.bind(this))
      .then(this.createAccountStorage.bind(this))
      .then(this.initSession.bind(this))
      .then(this.sendResponse.bind(this))
      .then(userAccount => {
        // 'return' not used deliberately, no need to block and wait for email
        accountManager.sendWelcomeEmail(userAccount)
      })
      .then(() => {
        return userAccount
      })
  }

  /**
   * Rejects with an error if an account already exists, otherwise simply
   * resolves with the account.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @return {Promise<UserAccount>} Chainable
   */
  cancelIfAccountExists (userAccount) {
    let accountManager = this.accountManager

    return accountManager.accountExists(userAccount.username)
      .then(exists => {
        if (exists) {
          let error = new Error('Account already exists')
          error.status = 400
          throw error
        }
        // Account does not exist, proceed
        return userAccount
      })
  }

  /**
   * Creates the root storage folder, initializes default containers and
   * resources for the new account.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If errors were encountering while creating new account
   *   resources, or saving generated credentials.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  createAccountStorage (userAccount) {
    return this.accountManager.createAccountFor(userAccount)
      .catch(error => {
        error.message = 'Error creating account storage: ' + error.message
        throw error
      })
      .then(() => {
        // Once the account folder has been initialized,
        // save the public keys or other generated credentials to the profile
        return this.saveCredentialsFor(userAccount)
      })
      .then(() => {
        return userAccount
      })
  }

  /**
   * Initializes the session with the newly created user's credentials
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @return {UserAccount} Chainable
   */
  initSession (userAccount) {
    let session = this.session

    if (!session) { return userAccount }

    session.userId = userAccount.webId
    session.identified = true
    return userAccount
  }
}

/**
 * Models a Create Account request for a server using WebID-TLS as primary
 * authentication mode. Handles generating and saving a TLS certificate, etc.
 *
 * @class CreateTlsAccountRequest
 * @extends CreateAccountRequest
 */
class CreateTlsAccountRequest extends CreateAccountRequest {
  /**
   * @constructor
   *
   * @param [options={}] {Object} See `CreateAccountRequest` constructor docstring
   * @param [options.spkac] {string}
   */
  constructor (options = {}) {
    super(options)
    this.spkac = options.spkac
    this.certificate = null
  }

  /**
   * Generates required user credentials (WebID-TLS certificate, etc).
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<UserAccount>} Chainable
   */
  generateCredentials (userAccount) {
    return this.generateTlsCertificate(userAccount)
  }

  /**
   * Generates a new X.509v3 RSA certificate (if `spkac` was passed in) and
   * adds it to the user account. Used for storage in an agent's WebID
   * Profile, for WebID-TLS authentication.
   *
   * @param userAccount {UserAccount}
   * @param userAccount.webId {string} An agent's WebID URI
   *
   * @throws {Error} HTTP 400 error if errors were encountering during certificate
   *   generation.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  generateTlsCertificate (userAccount) {
    return Promise.resolve()
      .then(() => {
        let host = this.accountManager.host
        return WebIdTlsCertificate.fromSpkacPost(this.spkac, userAccount, host)
          .generateCertificate()
      })
      .catch(err => {
        err.status = 400
        err.message = 'Error generating a certificate: ' + err.message
        throw err
      })
      .then(certificate => {
        this.certificate = certificate
        return userAccount
      })
  }

  /**
   * If a WebID-TLS certificate was generated, saves it to the user's profile
   * graph.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<null|Graph>}
   */
  saveCredentialsFor (userAccount) {
    if (!this.certificate) {
      return Promise.resolve(null)
    }

    return this.accountManager
      .addCertKeyToProfile(this.certificate, userAccount)
  }

  /**
   * Writes the generated TLS certificate to the http Response object.
   *
   * @param userAccount {UserAccount}
   *
   * @return {UserAccount} Chainable
   */
  sendResponse (userAccount) {
    let res = this.response
    res.set('User', userAccount.webId)
    res.status(200)

    res.set('Content-Type', 'application/x-x509-user-cert')
    res.send(this.certificate.toDER())

    return userAccount
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
module.exports.CreateTlsAccountRequest = CreateTlsAccountRequest
