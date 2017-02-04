'use strict'

const WebIdTlsCertificate = require('../models/webid-tls-certificate')
const debug = require('./../debug').accounts

class AddCertificateRequest {
  /**
   * @param [options={}] {Object}
   * @param [options.accountManager] {AccountManager}
   * @param [options.userAccount] {UserAccount}
   * @param [options.certificate] {WebIdTlsCertificate}
   * @param [options.response] {HttpResponse}
   */
  constructor (options) {
    this.accountManager = options.accountManager
    this.userAccount = options.userAccount
    this.certificate = options.certificate
    this.response = options.response
  }

  /**
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError}
   * @return {Promise}
   */
  static handle (req, res, accountManager) {
    let request
    try {
      request = AddCertificateRequest.fromParams(req, res, accountManager)
    } catch (error) {
      return Promise.reject(error)
    }

    return AddCertificateRequest.addCertificate(request)
  }

  /**
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError}
   * @return {AddCertificateRequest}
   */
  static fromParams (req, res, accountManager) {
    let userAccount = accountManager.userAccountFrom(req.body)
    let certificate = WebIdTlsCertificate.fromSpkacPost(
      req.body.spkac,
      userAccount,
      accountManager.host)

    debug(`Adding a new certificate for ${userAccount.webId}`)

    if (req.session.userId !== userAccount.webId) {
      debug(`Cannot add new certificate: signed in user is "${req.session.userId}"`)
      let error = new Error("You are not logged in, so you can't create a certificate")
      error.status = 401
      throw error
    }

    let options = {
      accountManager,
      userAccount,
      certificate,
      response: res
    }

    return new AddCertificateRequest(options)
  }

  /**
   * Generates a new certificate for a given user account, and adds it to that
   * account's WebID Profile graph.
   *
   * @param request {AddCertificateRequest}
   *
   * @returns {Promise}
   */
  static addCertificate (request) {
    let { certificate, userAccount, accountManager } = request
    let host = accountManager.host

    return certificate.generateCertificate(userAccount, host)
      .catch(err => {
        err.status = 400
        err.message = 'Error generating a certificate: ' + err.message
        throw err
      })
      .then(() => {
        return accountManager.addCertKeyToProfile(certificate, userAccount)
      })
      .catch(err => {
        err.status = 400
        err.message = 'Error adding certificate to profile: ' + err.message
        throw err
      })
      .then(() => {
        request.sendResponse(certificate)
      })
  }

  /**
   * @param certificate {WebIdTlsCertificate}
   */
  sendResponse (certificate) {
    let { response, userAccount } = this
    response.set('User', userAccount.webId)
    response.status(200)

    response.set('Content-Type', 'application/x-x509-user-cert')
    response.send(certificate.toDER())
  }
}

module.exports = AddCertificateRequest
