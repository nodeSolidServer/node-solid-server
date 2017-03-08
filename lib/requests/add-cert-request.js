'use strict'

const WebIdTlsCertificate = require('../models/webid-tls-certificate')
const debug = require('./../debug').accounts

/**
 * Represents an 'add new certificate to account' request
 * (a POST to `/api/accounts/cert` endpoint).
 *
 * Note: The account has to exist, and the user must be already logged in,
 * for this to succeed.
 */
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
   * Handles the HTTP request (from an Express route handler).
   *
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError}
   * @throws {Error} HTTP 401 if the user is not logged in (`req.session.userId`
   *   does not match the intended account to which the cert is being added).
   *
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
   * Factory method, returns an initialized instance of `AddCertificateRequest`.
   *
   * @param req
   * @param res
   * @param accountManager {AccountManager}
   *
   * @throws {TypeError} If required parameters missing
   * @throws {Error} HTTP 401 if the user is not logged in (`req.session.userId`
   *   does not match the intended account to which the cert is being added).
   *
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
   * @throws {Error} HTTP 400 if there were errors during certificate generation
   *
   * @returns {Promise}
   */
  static addCertificate (request) {
    let { certificate, userAccount, accountManager } = request

    return certificate.generateCertificate()
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
   * Sends the generated certificate in the response object.
   *
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
