'use strict'

const webid = require('webid')

const utils = require('../utils')

class CreateAccountRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.req]
   * @param [options.res]
   * @param [options.authMethod] {string}
   * @param [options.username] {string}
   * @param [options.email] {string}
   * @param [options.name] {string}
   * @param [options.spkac] {string}
   *
   * @return {CreateAccountRequest}
   */
  static fromConfig (options = {}) {
    if (options.authMethod === 'tls') {
      return CreateTlsAccountRequest.fromConfig(options)
    } else {
      throw new Error('Unsupported authentication scheme')
    }
  }

  static configFromParams (accountManager, req, res) {
    let config = {
      accountManager, req, res,

      authMethod: accountManager.authMethod,

      username: req.body.username,
      email: req.body.email,
      name: req.body.name,
      spkac: req.body.spkac
    }
    config.webId = accountManager.buildWebIdForAccount(config.username)
    return config
  }

  static fromParams (accountManager, req, res) {
    let config = CreateAccountRequest.configFromParams(accountManager, req, res)
    return CreateAccountRequest.fromConfig(config)
  }

  /**
   * @return {Promise}
   */
  createAccount () {
    return Promise.resolve()
      .then(() => {
        return this.generateCredentials()
      })
      .then(credentials => {
        return this.createAccountFolders(credentials)
      })
      .then(() => {
        return this.initSession()
      })
      .then(() => {
        return this.sendResponse()
      })
  }

  createAccountFolders (certificate) {
    return Promise.resolve()
  }

  initSession () {
    // req.session.userId = agent
    // req.session.identified = true
  }

  sendResponse () {
    // res.set('User', agent)
    // res.status(200)
    // // Write response
    // if (cert) {
    //   res.set('Content-Type', 'application/x-x509-user-cert')
    //   // Convert to DER
    //   var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
    //   res.send(der)
    // } else {
    //   res.end()
    // }
  }
}

class CreateTlsAccountRequest extends CreateAccountRequest {
  constructor (options = {}) {
    super()
    this.webidTls = options.webidTls || webid('tls')
  }

  static fromConfig (options) {
    return new CreateTlsAccountRequest(options)
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
   * @return {Promise.<X509Certificate|null>}
   */
  generateCredentials () {
    return this.generateTlsCertificate(this.spkac, this.webId)
  }

  /**
   * Generates a new WebID-TLS certificate (used for storage in an agent's WebID
   * Profile, for WebID-TLS authentication).
   *
   * @param spkac {string} Signed Public Key and Challenge from a browser's
   *   `<keygen>` element.
   * @param webId {string} An agent's WebID URI
   *
   * @return {Promise<X509Certificate|null>} Resolves to a X.509v3 RSA
   *   certificate if `spkac` was passed in, and `null` otherwise.
   */
  generateTlsCertificate (spkac, webId) {
    // Generate a new WebID-TLS certificate, if appropriate
    if (!spkac) {
      return Promise.resolve(null)
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
          resolve(certificate)
        }
      })
    })
  }
}

module.exports = CreateAccountRequest
module.exports.CreateAccountRequest = CreateAccountRequest
module.exports.CreateTlsAccountRequest = CreateTlsAccountRequest
