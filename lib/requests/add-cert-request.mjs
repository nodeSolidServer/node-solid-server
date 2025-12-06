import WebIdTlsCertificate from '../models/webid-tls-certificate.mjs'
import debugModule from '../debug.mjs'

const debug = debugModule.accounts

export default class AddCertificateRequest {
  constructor (options) {
    this.accountManager = options.accountManager
    this.userAccount = options.userAccount
    this.certificate = options.certificate
    this.response = options.response
  }

  static handle (req, res, accountManager) {
    let request
    try {
      request = AddCertificateRequest.fromParams(req, res, accountManager)
    } catch (error) {
      return Promise.reject(error)
    }
    return AddCertificateRequest.addCertificate(request)
  }

  static fromParams (req, res, accountManager) {
    const userAccount = accountManager.userAccountFrom(req.body)
    const certificate = WebIdTlsCertificate.fromSpkacPost(
      req.body.spkac,
      userAccount,
      accountManager.host
    )
    debug(`Adding a new certificate for ${userAccount.webId}`)
    if (req.session.userId !== userAccount.webId) {
      debug(`Cannot add new certificate: signed in user is "${req.session.userId}"`)
      const error = new Error("You are not logged in, so you can't create a certificate")
      error.status = 401
      throw error
    }
    const options = { accountManager, userAccount, certificate, response: res }
    return new AddCertificateRequest(options)
  }

  static addCertificate (request) {
    const { certificate, userAccount, accountManager } = request
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

  sendResponse (certificate) {
    const { response, userAccount } = this
    response.set('User', userAccount.webId)
    response.status(200)
    response.set('Content-Type', 'application/x-x509-user-cert')
    response.send(certificate.toDER())
  }
}
