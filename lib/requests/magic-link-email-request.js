'use strict'

const crypto = require('crypto')
const AuthRequest = require('./auth-request')
const debug = require('./../debug').accounts

class MagicLinkEmailRequest extends AuthRequest {
  constructor (options) {
    super(options)

    this.returnToUrl = options.returnToUrl
    this.email = options.email
    this.accountManager = options.accountManager
    this.username = options.username
    this.password = options.password
    this.userAccount = this.accountManager.userAccountFrom(options)
  }

  static fromParams (req, res) {
    let locals = req.app.locals
    let accountManager = locals.accountManager

    let returnToUrl = this.parseParameter(req, 'returnToUrl')
    let email = this.parseParameter(req, 'email')
    let username = crypto.createHash('md5').update(email).digest('hex')
    let password = crypto.randomBytes(64).toString('hex')

    let options = {
      accountManager,
      returnToUrl,
      email,
      username,
      password,
      response: res
    }

    return new MagicLinkEmailRequest(options)
  }

  static get (req, res) {
    const request = MagicLinkEmailRequest.fromParams(req, res)

    request.renderForm()
  }

  static post (req, res) {
    const request = MagicLinkEmailRequest.fromParams(req, res)

    debug(`Email '${request.email}' requested to be sent a magic link email`)

    return MagicLinkEmailRequest.handlePost(request)
  }

  static handlePost (request) {
    return Promise.resolve()
      .then(() => request.findOrCreateUser())
      .then(userAccount => request.sendMagicLink(userAccount))
      .then(() => request.renderSuccess())
      .catch(error => request.error(error))
  }

  findOrCreateUser () {
    return this.accountManager.accountExists(this.username)
      .then(exists => {
        if (!exists) {
          return this.createAccount()
        }

        return this.accountManager.userAccountFrom(this.userAccount)
      })
  }

  async createAccount () {
    let userAccount = this.userAccount

    await this.createAccountStorage(userAccount)
    await this.saveCredentialsFor(userAccount)

    return userAccount
  }

  createUser (userAccount) {
    return this.createAccountStorage.then(userAccount => {
      return this.saveCredentialsFor(userAccount)
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

  saveCredentialsFor (userAccount) {
    return this.userStore.createUser(userAccount, this.password)
      .then(() => {
        debug('User credentials stored')
        return userAccount
      })
  }

  sendMagicLink (userAccount) {
    let accountManager = this.accountManager

    return accountManager.loadAccountRecoveryEmail(userAccount)
      .then(magicLinkEmail => {
        userAccount.email = magicLinkEmail

        debug('Sending magic link email to:', magicLinkEmail)

        return accountManager
          .sendMagicLinkEmail(userAccount, this.returnToUrl)
      })
  }

  renderForm () {
    let params = {
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    this.response.render('auth/magic-link', params)
  }

  renderSuccess () {
    this.response.render('auth/magic-link-sent')
  }

  error (error) {
    let res = this.response

    debug(error)

    let params = {
      error: error.message,
      returnToUrl: this.returnToUrl,
      multiuser: this.accountManager.multiuser
    }

    res.status(error.statusCode || 400)

    res.render('auth/magic-link', params)
  }
}

module.exports = MagicLinkEmailRequest
