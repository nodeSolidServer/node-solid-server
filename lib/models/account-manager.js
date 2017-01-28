'use strict'

const url = require('url')

const CreateAccountRequest = require('./create-account-request')
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

  static fromConfig (options = {}) {
    return new AccountManager(options)
  }

  /**
   * Composes a WebID (uri with hash fragment) for a given account name.
   * Usage:
   *
   *   ```
   *   acctMgr.buildWebIdForAccount('alice')
   *   // in multi user mode:
   *   // -> 'https://alice.example.com/profile/card#me'
   *
   *   // in single user mode:
   *   // -> 'https://example.com/profile/card#me'
   *   ```
   *
   * @param accountName {string}
   * @throws {TypeError} (via accountUriFor()) if no accountName is passed in
   * @return {string}
   */
  buildWebIdForAccount (accountName) {
    if (!this.host || !this.host.serverUri) {
      throw new TypeError('Cannot build webId, host not initialized with serverUri')
    }

    let accountUri = this.multiUser
      ? this.host.accountUriFor(accountName)
      : this.host.serverUri  // single user mode

    let webIdUri = url.parse(url.resolve(accountUri, this.pathCard))
    webIdUri.hash = this.suffixURI
    return webIdUri.format()
  }

  createAccount (req, res, next) {
    let request = CreateAccountRequest.fromParams(this, req, res)

    request.createAccount()
      .then(() => {
        // 'return' not used deliberately, no need to block and wait for email
        this.sendWelcomeEmail()
      })
      .then(() => { next() })
      .catch(err => {
        console.log(err)
        next(err)
      })
  }

  sendWelcomeEmail () {
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
}

module.exports = AccountManager
