'use strict'

const webid = require('webid')
const forge = require('node-forge')
const webidTls = webid('tls')

const utils = require('../utils')
// const debug = require('./../debug').accounts

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
   * @param [options={}] {Object} See the `constructor()` docstring.
   * @return {CreateAccountRequest}
   */
  static from (options = {}) {
    if (options.accountManager.authMethod === 'tls') {
      return new CreateTlsAccountRequest(options)
    } else {
      throw new Error('Unsupported authentication scheme')
    }
  }

  /**
   * Creates an account for a given user.
   *
   * @param userAccount {UserAccount} Instance of the account to be created
   *
   * @return {Promise<UserAccount>} Chainable
   */
  createAccount (userAccount = this.userAccount) {
    return Promise.resolve(userAccount)
      .then(this.generateCredentials.bind(this))
      .then(this.createAccountStorage.bind(this))
      .then(this.initSession.bind(this))
      .then(this.sendResponse.bind(this))
      .then(() => {
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
   * Formats a `<keygen>`-generated public key and converts it into a Buffer,
   * to use in TLS certificate generation.
   *
   * @param spkac {string} Signed Public Key and Challenge from a browser's
   *   `<keygen>` element.
   *
   * @return {Buffer<string>|null} UTF-8 string buffer of the public key, if one
   *   was passed in.
   */
  prepPublicKey (spkac) {
    if (!spkac) { return null }

    spkac = utils.stripLineEndings(spkac)
    spkac = new Buffer(spkac, 'utf-8')
    return spkac
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
   * @param userAccount.spkac {string} Signed Public Key and Challenge from a
   *   browser's `<keygen>` element.
   * @param userAccount.webId {string} An agent's WebID URI
   *
   * @return {Promise<UserAccount>} Chainable
   */
  generateTlsCertificate (userAccount) {
    let spkac = userAccount.spkac
    let webId = userAccount.webId

    // Generate a new WebID-TLS certificate, if appropriate
    if (!spkac) {
      return Promise.resolve(userAccount)
    }

    spkac = this.prepPublicKey(spkac)

    return new Promise((resolve, reject) => {
      webidTls.generate({
        spkac,
        agent: webId
      },
      (err, certificate) => {
        if (err) {
          reject(err)
        } else {
          userAccount.certificate = certificate
          resolve(userAccount)
        }
      })
    })
  }

  sendResponse (userAccount) {
    let res = this.response
    res.set('User', userAccount.webId)
    res.status(200)

    // Write response
    if (userAccount.certificate) {
      this.sendCertificate(res, userAccount.certificate)
    } else {
      res.end()
    }
    return userAccount
  }

  sendCertificate (res, certificate) {
    res.set('Content-Type', 'application/x-x509-user-cert')

    let certificateAsn = forge.pki.certificateToAsn1(certificate)
    // Convert to DER
    let certificateDer = forge.asn1.toDer(certificateAsn).getBytes()
    res.send(certificateDer)
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
module.exports.CreateTlsAccountRequest = CreateTlsAccountRequest
