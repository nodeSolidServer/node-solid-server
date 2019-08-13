'use strict'

const AuthRequest = require('./auth-request')
const WebIdTlsCertificate = require('../models/webid-tls-certificate')
const debug = require('../debug').accounts
const blacklistService = require('../services/blacklist-service')
const { isValidUsername } = require('../common/user-utils')

/**
 * Represents a 'create new user account' http request (either a POST to the
 * `/accounts/api/new` endpoint, or a GET to `/register`).
 *
 * Intended just for browser-based requests; to create new user accounts from
 * a command line, use the `AccountManager` class directly.
 *
 * This is an abstract class, subclasses are created (for example
 * `CreateOidcAccountRequest`) depending on which Authentication mode the server
 * is running in.
 *
 * @class CreateAccountRequest
 */
class CreateAccountRequest extends AuthRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.userAccount] {UserAccount}
   * @param [options.session] {Session} e.g. req.session
   * @param [options.response] {HttpResponse}
   * @param [options.returnToUrl] {string} If present, redirect the agent to
   *   this url on successful account creation
   * @param [options.enforceToc] {boolean} Whether or not to enforce the service provider's T&C
   * @param [options.tocUri] {string} URI to the service provider's T&C
   * @param [options.acceptToc] {boolean} Whether or not user has accepted T&C
   */
  constructor (options) {
    super(options)

    this.username = options.username
    this.userAccount = options.userAccount
    this.acceptToc = options.acceptToc
    this.disablePasswordChecks = options.disablePasswordChecks
  }

  /**
   * Factory method, creates an appropriate CreateAccountRequest subclass from
   * an HTTP request (browser form submit), depending on the authn method.
   *
   * @param req
   * @param res
   *
   * @throws {Error} If required parameters are missing (via
   *   `userAccountFrom()`), or it encounters an unsupported authentication
   *   scheme.
   *
   * @return {CreateOidcAccountRequest|CreateTlsAccountRequest}
   */
  static fromParams (req, res) {
    let options = AuthRequest.requestOptions(req, res)

    let locals = req.app.locals
    let authMethod = locals.authMethod
    let accountManager = locals.accountManager

    let body = req.body || {}

    if (body.username) {
      options.username = body.username.toLowerCase()
      options.userAccount = accountManager.userAccountFrom(body)
    }

    options.enforceToc = locals.enforceToc
    options.tocUri = locals.tocUri
    options.disablePasswordChecks = locals.disablePasswordChecks

    switch (authMethod) {
      case 'oidc':
        options.password = body.password
        return new CreateOidcAccountRequest(options)
      case 'tls':
        options.spkac = body.spkac
        return new CreateTlsAccountRequest(options)
      default:
        throw new TypeError('Unsupported authentication scheme')
    }
  }

  static async post (req, res) {
    let request = CreateAccountRequest.fromParams(req, res)

    try {
      request.validate()
      await request.createAccount()
    } catch (error) {
      request.error(error, req.body)
    }
  }

  static get (req, res) {
    let request = CreateAccountRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.renderForm())
      .catch(error => request.error(error))
  }

  /**
   * Renders the Register form
   */
  renderForm (error, data = {}) {
    let authMethod = this.accountManager.authMethod

    let params = Object.assign({}, this.authQueryParams, {
      enforceToc: this.enforceToc,
      loginUrl: this.loginUrl(),
      multiuser: this.accountManager.multiuser,
      registerDisabled: authMethod === 'tls',
      returnToUrl: this.returnToUrl,
      tocUri: this.tocUri,
      disablePasswordChecks: this.disablePasswordChecks,
      username: data.username,
      name: data.name,
      email: data.email,
      externalWebId: data.externalWebId,
      acceptToc: data.acceptToc,
      connectExternalWebId: data.connectExternalWebId
    })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('account/register', params)
  }

  /**
   * Creates an account for a given user (from a POST to `/api/accounts/new`)
   *
   * @throws {Error} If errors were encountering while validating the username.
   *
   * @return {Promise<UserAccount>} Resolves with newly created account instance
   */
  async createAccount () {
    let userAccount = this.userAccount
    let accountManager = this.accountManager

    this.cancelIfUsernameInvalid(userAccount)
    this.cancelIfBlacklistedUsername(userAccount)
    await this.cancelIfAccountExists(userAccount)
    await this.createAccountStorage(userAccount)
    await this.saveCredentialsFor(userAccount)
    await this.sendResponse(userAccount)

    // 'return' not used deliberately, no need to block and wait for email
    if (userAccount && userAccount.email) {
      debug('Sending Welcome email')
      accountManager.sendWelcomeEmail(userAccount)
    }

    return userAccount
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
          debug(`Canceling account creation, ${userAccount.webId} already exists`)
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
   *   resources.
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
        debug('Account storage resources created')
        return userAccount
      })
  }

  /**
   * Check if a username is a valid slug.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If errors were encountering while validating the
   *   username.
   *
   * @return {UserAccount} Chainable
   */
  cancelIfUsernameInvalid (userAccount) {
    if (!userAccount.username || !isValidUsername(userAccount.username)) {
      debug('Invalid username ' + userAccount.username)
      const error = new Error('Invalid username (contains invalid characters)')
      error.status = 400
      throw error
    }

    return userAccount
  }

  /**
   * Check if a username is a valid slug.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @throws {Error} If username is blacklisted
   *
   * @return {UserAccount} Chainable
   */
  cancelIfBlacklistedUsername (userAccount) {
    const validUsername = blacklistService.validate(userAccount.username)
    if (!validUsername) {
      debug('Invalid username ' + userAccount.username)
      const error = new Error('Invalid username (username is blacklisted)')
      error.status = 400
      throw error
    }

    return userAccount
  }
}

/**
 * Models a Create Account request for a server using WebID-OIDC (OpenID Connect)
 * as a primary authentication mode. Handles saving user credentials to the
 * `UserStore`, etc.
 *
 * @class CreateOidcAccountRequest
 * @extends CreateAccountRequest
 */
class CreateOidcAccountRequest extends CreateAccountRequest {
  /**
   * @constructor
   *
   * @param [options={}] {Object} See `CreateAccountRequest` constructor docstring
   * @param [options.password] {string} Password, as entered by the user at signup
   * @param [options.acceptToc] {boolean} Whether or not user has accepted T&C
   */
  constructor (options) {
    super(options)

    this.password = options.password
  }

  /**
   * Validates the Login request (makes sure required parameters are present),
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

    if (this.enforceToc && !this.acceptToc) {
      error = new Error('Accepting Terms & Conditions is required for this service')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Generate salted password hash, etc.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<null|Graph>}
   */
  saveCredentialsFor (userAccount) {
    return this.userStore.createUser(userAccount, this.password)
      .then(() => {
        debug('User credentials stored')
        return userAccount
      })
  }

  /**
   * Generate the response for the account creation
   *
   * @param userAccount {UserAccount}
   *
   * @return {UserAccount}
   */
  sendResponse (userAccount) {
    let redirectUrl = this.returnToUrl || userAccount.podUri
    this.response.redirect(redirectUrl)

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
   * @param [options.acceptToc] {boolean} Whether or not user has accepted T&C
   */
  constructor (options) {
    super(options)

    this.spkac = options.spkac
    this.certificate = null
  }

  /**
   * Validates the Signup request (makes sure required parameters are present),
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

    if (this.enforceToc && !this.acceptToc) {
      error = new Error('Accepting Terms & Conditions is required for this service')
      error.statusCode = 400
      throw error
    }
  }

  /**
   * Generates a new X.509v3 RSA certificate (if `spkac` was passed in) and
   * adds it to the user account. Used for storage in an agent's WebID
   * Profile, for WebID-TLS authentication.
   *
   * @param userAccount {UserAccount}
   * @param userAccount.webId {string} An agent's WebID URI
   *
   * @throws {Error} HTTP 400 error if errors were encountering during
   *   certificate generation.
   *
   * @return {Promise<UserAccount>} Chainable
   */
  generateTlsCertificate (userAccount) {
    if (!this.spkac) {
      debug('Missing spkac param, not generating cert during account creation')
      return Promise.resolve(userAccount)
    }

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
        debug('Generated a WebID-TLS certificate as part of account creation')
        this.certificate = certificate
        return userAccount
      })
  }

  /**
   * Generates a WebID-TLS certificate and saves it to the user's profile
   * graph.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Promise<UserAccount>} Chainable
   */
  saveCredentialsFor (userAccount) {
    return this.generateTlsCertificate(userAccount)
      .then(userAccount => {
        if (this.certificate) {
          return this.accountManager
            .addCertKeyToProfile(this.certificate, userAccount)
            .then(() => {
              debug('Saved generated WebID-TLS certificate to profile')
            })
        } else {
          debug('No certificate generated, no need to save to profile')
        }
      })
      .then(() => {
        return userAccount
      })
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

    if (this.certificate) {
      res.set('Content-Type', 'application/x-x509-user-cert')
      res.send(this.certificate.toDER())
    } else {
      res.end()
    }

    return userAccount
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
module.exports.CreateTlsAccountRequest = CreateTlsAccountRequest
