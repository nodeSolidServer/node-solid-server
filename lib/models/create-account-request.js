'use strict'

const webid = require('webid')
const forge = require('node-forge')

const utils = require('../utils')

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
   * @return {Promise<UserAccount>}
   */
  createAccount (userAccount = this.userAccount) {
    return Promise.resolve(userAccount)
      .then(this.generateCredentials.bind(this))
      .then(this.createAccountFolders.bind(this))
      .then(this.initSession.bind(this))
      .then(this.sendResponse.bind(this))
      .then(() => {
        return userAccount
      })
  }

  createAccountFolders (userAccount) {
    return Promise.resolve(userAccount)
  }

  /**
   * @param userAccount
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
  constructor (options = {}) {
    super(options)
    this.webidTls = options.webidTls || webid('tls')
  }

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
      this.webidTls.generate({
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
      this.sendCertificateResponse(res, userAccount.certificate)
    } else {
      res.end()
    }
    return userAccount
  }

  sendCertificateResponse (res, certificate) {
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
