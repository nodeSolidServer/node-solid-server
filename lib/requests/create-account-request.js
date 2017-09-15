'use strict'

const AuthRequest = require('./auth-request')
const WebIdTlsCertificate = require('../models/webid-tls-certificate')
const debug = require('../debug').accounts

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
   */
  constructor (options) {
    super(options)

    this.username = options.username
    this.userAccount = options.userAccount
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
   * @return {CreateAccountRequest|CreateTlsAccountRequest}
   */
  static fromParams (req, res) {
    let options = AuthRequest.requestOptions(req, res)

    let locals = req.app.locals
    let authMethod = locals.authMethod
    let accountManager = locals.accountManager

    let body = req.body || {}

    options.username = body.username

    if (options.username) {
      options.userAccount = accountManager.userAccountFrom(body)
    }

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

  static post (req, res) {
    let request = CreateAccountRequest.fromParams(req, res)

    return Promise.resolve()
      .then(() => request.validate())
      .then(() => request.createAccount())
      .catch(error => request.error(error))
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
  renderForm (error) {
    let authMethod = this.accountManager.authMethod

    let params = Object.assign({}, this.authQueryParams,
      {
        returnToUrl: this.returnToUrl,
        loginUrl: this.loginUrl(),
        registerDisabled: authMethod === 'tls'
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
   * @throws {Error} An http 400 error if an account already exists
   *
   * @return {Promise<UserAccount>} Resolves with newly created account instance
   */
  createAccount () {
    let userAccount = this.userAccount
    let accountManager = this.accountManager

    return Promise.resolve(userAccount)
      .then(this.cancelIfAccountExists.bind(this))
      .then(this.createAccountStorage.bind(this))
      .then(this.saveCredentialsFor.bind(this))
      .then(this.initUserSession.bind(this))
      .then(this.sendResponse.bind(this))
      .then(userAccount => {
        // 'return' not used deliberately, no need to block and wait for email
        if (userAccount && userAccount.email) {
          debug('Sending Welcome email')
          accountManager.sendWelcomeEmail(userAccount)
        }
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

  sendResponse (userAccount) {
    let redirectUrl = this.returnToUrl ||
      this.accountManager.accountUriFor(userAccount.username)
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
   */
  constructor (options) {
    super(options)

    this.spkac = options.spkac
    this.certificate = null
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
