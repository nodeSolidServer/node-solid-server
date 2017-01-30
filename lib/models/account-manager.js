'use strict'

const url = require('url')
const express = require('express')
const bodyParser = require('body-parser')

const CreateAccountRequest = require('./create-account-request')
const UserAccount = require('./user-account')

const errorHandler = require('./../handlers/error-pages')
const utils = require('../utils')

class AccountManager {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.authMethod] {string}
   * @param [options.emailService] {EmailService}
   * @param [options.host] {SolidHost}
   * @param [options.multiUser=false] {boolean} argv.idp
   * @param [options.store] {LDP}
   */
  constructor (options = {}) {
    if (!options.host) {
      throw TypeError('AccountManager requires a host instance')
    }
    this.host = options.host
    this.emailService = options.emailService
    this.authMethod = options.authMethod
    this.multiUser = options.multiUser || false
    this.store = options.store
    this.pathCard = options.pathCard || 'profile/card'
    this.suffixURI = options.suffixURI || '#me'
  }

  static from (options = {}) {
    return new AccountManager(options)
  }

  /**
   * Tests whether an account already exists for a given username.
   * Usage:
   *
   *   ```
   *   accountManager.accountExists('alice')
   *     .then(exists => {
   *       console.log('answer: ', exists)
   *     })
   *   ```
   * @param accountName {string} Account username, e.g. 'alice'
   * @return {Promise<boolean>}
   */
  accountExists (accountName) {
    let accountUri
    let accountResource

    try {
      accountUri = this.accountUriFor(accountName)
      accountUri = url.parse(accountUri).hostname

      if (this.multiUser) {
        accountResource = '/'
      } else {
        accountResource = url.resolve('/', this.store.suffixAcl)
      }
    } catch (err) {
      return Promise.reject(err)
    }

    return new Promise((resolve, reject) => {
      this.store.exists(accountUri, accountResource, (err, result) => {
        if (err) {
          if (err.status === 404) {
            return resolve(false)
          } else {
            reject(err)
          }
        }

        resolve(!!result)
      })
    })
  }

  /**
   * Composes an account URI for a given account name.
   * Usage (given a host with serverUri of 'https://example.com'):
   *
   *   ```
   *   acctMgr.accountUriFor('alice')
   *   // in multi user mode:
   *   // -> 'https://alice.example.com'
   *
   *   // in single user mode:
   *   // -> 'https://example.com'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {TypeError} If required parameters are missing
   * @return {string}
   */
  accountUriFor (accountName) {
    if (!this.host || !this.host.serverUri) {
      throw new TypeError('Cannot build webId, host not initialized with serverUri')
    }

    let accountUri = this.multiUser
      ? this.host.accountUriFor(accountName)
      : this.host.serverUri  // single user mode

    return accountUri
  }

  /**
   * Composes a WebID (uri with hash fragment) for a given account name.
   * Usage:
   *
   *   ```
   *   acctMgr.accountWebIdFor('alice')
   *   // in multi user mode:
   *   // -> 'https://alice.example.com/profile/card#me'
   *
   *   // in single user mode:
   *   // -> 'https://example.com/profile/card#me'
   *   ```
   *
   * @param [accountName] {string}
   * @throws {TypeError} If required parameters are missing
   * @return {string}
   */
  accountWebIdFor (accountName) {
    let accountUri = this.accountUriFor(accountName)

    let webIdUri = url.parse(url.resolve(accountUri, this.pathCard))
    webIdUri.hash = this.suffixURI
    return webIdUri.format()
  }

  handleCreateAccount (req, res, next) {
    let newAccount
    try {
      newAccount = this.userAccountFrom(req.body)
    } catch (err) {
      err.status = err.status || 400
      return next(err)
    }

    this.createAccountFor(newAccount, req.session, res)
      .then(() => { next() })
      .catch(err => {
        err.status = err.status || 400
        next(err)
      })
  }

  /**
   * @param userAccount {UserAccount} New user account to be created
   * @param session {Session} e.g. req.session
   * @param response {HttpResponse}
   *
   * @throws {Error} An http 400 error if an account already exists
   * @return {Promise<UserAccount>}
   */
  createAccountFor (userAccount, session, response) {
    return this.accountExists(userAccount.username)
      .then(exists => {
        if (exists) {
          let error = new Error('Account already exists')
          error.status = 400
          throw error
        }
        // Account does not exist, proceed
      })
      .then(() => {
        let config = { accountManager: this, userAccount, session, response }
        let request = CreateAccountRequest.from(config)

        return request.createAccount(userAccount)
      })
      .then(userAccount => {
        // 'return' not used deliberately, no need to block and wait for email
        this.sendWelcomeEmail(userAccount)
      })
  }

  /**
   * @param userData {Object} Options hashmap, like req.body
   * @throws {TypeError} If user data does not validate
   * @return {UserAccount}
   */
  userAccountFrom (userData) {
    this.validateUserData(userData)

    let userConfig = {
      username: userData.username,
      email: userData.email,
      name: userData.name,
      spkac: userData.spkac,
      webId: this.accountWebIdFor(userData.username)
    }
    return UserAccount.from(userConfig)
  }

  validateUserData (userData = {}) {
    if (!userData.username) {
      throw new TypeError('Username required for new user accounts')
    }
  }

  /**
   * Mounted on /api/accounts
   */
  middleware (firstUser) {
    let router = express.Router('/')
    let parser = bodyParser.urlencoded({ extended: false })

    router.post('/new',
      parser,
      setFirstUser(firstUser),
      this.handleCreateAccount
    )
    if (this.authMethod === 'tls') {
      router.post('/cert', parser, this.newCert.bind(this))
    }
    router.all('/*', (req, res) => {
      var host = utils.uriAbs(req)
      // TODO replace the hardcoded link with an arg
      res.redirect('https://solid.github.io/solid-signup/?acc=api/accounts/new&crt=api/accounts/cert&domain=' + host)
    })
    router.use(errorHandler)

    return router
  }

  /**
   * @param newUser {UserAccount}
   * @param newUser.email {string}
   * @param newUser.webId {string}
   * @param newUser.name {string}
   * @return {Promise}
   */
  sendWelcomeEmail (newUser) {
    let emailService = this.emailService

    if (!emailService || !newUser.email) {
      return Promise.resolve(null)
    }

    let templateSender = emailService.mailer.templateSender
    let emailData = {
      from: `"no-reply" <${emailService.sender}>`,
      to: newUser.email
    }
    let userData = {
      webid: newUser.webId,
      name: newUser.name || 'User'
    }
    return new Promise((resolve, reject) => {
      emailService.welcomeTemplate((template) => {
        const sendWelcomeEmail = templateSender(
          template,
          { from: emailData.from }
        )

        // use template based sender to send a message
        sendWelcomeEmail({ to: emailData.to }, userData, (err) => {
          if (err) { return reject(err) }
          resolve()
        })
      })
    })
  }
}

module.exports = AccountManager
