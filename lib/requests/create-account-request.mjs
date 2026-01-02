import AuthRequest from './auth-request.mjs'
import WebIdTlsCertificate from '../models/webid-tls-certificate.mjs'
import debugModule from '../debug.mjs'
import blacklistService from '../services/blacklist-service.mjs'
import { isValidUsername } from '../common/user-utils.mjs'

const debug = debugModule.accounts

export class CreateAccountRequest extends AuthRequest {
  constructor (options) {
    super(options)
    this.username = options.username
    this.userAccount = options.userAccount
    this.acceptToc = options.acceptToc
    this.disablePasswordChecks = options.disablePasswordChecks
  }

  static fromParams (req, res) {
    const options = AuthRequest.requestOptions(req, res)
    const locals = req.app.locals
    const authMethod = locals.authMethod
    const accountManager = locals.accountManager
    const body = req.body || {}
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
    const request = CreateAccountRequest.fromParams(req, res)
    try {
      request.validate()
      await request.createAccount()
    } catch (error) {
      request.error(error, req.body)
    }
  }

  static get (req, res) {
    const request = CreateAccountRequest.fromParams(req, res)
    return Promise.resolve()
      .then(() => request.renderForm())
      .catch(error => request.error(error))
  }

  renderForm (error, data = {}) {
    const authMethod = this.accountManager.authMethod
    const params = Object.assign({}, this.authQueryParams, {
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
      acceptToc: data.acceptToc
    })
    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }
    this.response.render('account/register', params)
  }

  async createAccount () {
    const userAccount = this.userAccount
    const accountManager = this.accountManager
    if (userAccount.externalWebId) {
      const error = new Error('Linked users not currently supported, sorry (external WebID without TLS?)')
      error.statusCode = 400
      throw error
    }
    this.cancelIfUsernameInvalid(userAccount)
    this.cancelIfBlacklistedUsername(userAccount)
    await this.cancelIfAccountExists(userAccount)
    await this.createAccountStorage(userAccount)
    await this.saveCredentialsFor(userAccount)
    await this.sendResponse(userAccount)
    if (userAccount && userAccount.email) {
      debug('Sending Welcome email')
      accountManager.sendWelcomeEmail(userAccount)
    }
    return userAccount
  }

  cancelIfAccountExists (userAccount) {
    const accountManager = this.accountManager
    return accountManager.accountExists(userAccount.username)
      .then(exists => {
        if (exists) {
          debug(`Canceling account creation, ${userAccount.webId} already exists`)
          const error = new Error('Account creation failed')
          error.status = 400
          throw error
        }
        return userAccount
      })
  }

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

  cancelIfUsernameInvalid (userAccount) {
    if (!userAccount.username || !isValidUsername(userAccount.username)) {
      debug('Invalid username ' + userAccount.username)
      const error = new Error('Invalid username (contains invalid characters)')
      error.status = 400
      throw error
    }
    return userAccount
  }

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

export class CreateOidcAccountRequest extends CreateAccountRequest {
  constructor (options) {
    super(options)
    this.password = options.password
  }

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

  saveCredentialsFor (userAccount) {
    return this.userStore.createUser(userAccount, this.password)
      .then(() => {
        debug('User credentials stored')
        return userAccount
      })
  }

  sendResponse (userAccount) {
    const redirectUrl = this.returnToUrl || userAccount.podUri
    this.response.redirect(redirectUrl)
    return userAccount
  }
}

export class CreateTlsAccountRequest extends CreateAccountRequest {
  constructor (options) {
    super(options)
    this.spkac = options.spkac
    this.certificate = null
  }

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

  generateTlsCertificate (userAccount) {
    if (!this.spkac) {
      debug('Missing spkac param, not generating cert during account creation')
      return Promise.resolve(userAccount)
    }
    return Promise.resolve()
      .then(() => {
        const host = this.accountManager.host
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

  sendResponse (userAccount) {
    const res = this.response
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
