'use strict'

// const debug = require('./../debug').accounts
const WebIdTlsCertificate = require('../models/webid-tls-certificate')

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
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError}
   * @return {CreateAccountRequest}
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
   * @returns {Promise<UserAccount>} Chainable
   */
  createAccountStorage (userAccount) {
    return Promise.resolve(userAccount)
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

    if (!userAccount) {
      throw new TypeError('Cannot initialize session with an empty userAccount')
    }

    session.userId = userAccount.webId
    session.identified = true
    return userAccount
  }
}

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
   * @return {Promise<UserAccount>} Chainable
   */
  generateTlsCertificate (userAccount) {
    return Promise.resolve()
      .then(() => {
        let host = this.accountManager.host
        return WebIdTlsCertificate.fromSpkacPost(this.spkac, userAccount, host)
          .generateCertificate(userAccount, host)
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

  sendResponse (userAccount) {
    let res = this.response
    res.set('User', userAccount.webId)
    res.status(200)

    // Write response
    if (this.certificate) {
      this.sendCertificate(res, this.certificate)
    } else {
      res.end()
    }
    return userAccount
  }

  sendCertificate (res, certificate) {
    res.set('Content-Type', 'application/x-x509-user-cert')

    res.send(certificate.toDER())
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
module.exports.CreateTlsAccountRequest = CreateTlsAccountRequest
