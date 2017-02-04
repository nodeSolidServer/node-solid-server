'use strict'

const url = require('url')
const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)

const defaults = require('../../config/defaults')
const UserAccount = require('./user-account')
// const debug = require('./../debug').accounts

const DEFAULT_PROFILE_CONTENT_TYPE = 'text/turtle'

class AccountManager {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.authMethod] {string}
   * @param [options.emailService] {EmailService}
   * @param [options.host] {SolidHost}
   * @param [options.multiUser=false] {boolean} argv.idp
   * @param [options.store] {LDP}
   * @param [options.pathCard] {string}
   * @param [options.suffixURI] {string}
   */
  constructor (options = {}) {
    if (!options.host) {
      throw TypeError('AccountManager requires a host instance')
    }
    this.host = options.host
    this.emailService = options.emailService
    this.authMethod = options.authMethod || defaults.AUTH_METHOD
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
    let rootAclPath

    try {
      accountUri = this.accountUriFor(accountName)
      accountUri = url.parse(accountUri).hostname

      rootAclPath = url.resolve('/', this.store.suffixAcl)
    } catch (err) {
      return Promise.reject(err)
    }

    return this.accountUriExists(accountUri, rootAclPath)
  }

  accountUriExists (accountUri, accountResource = '/') {
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
   *   // in multi user mode:
   *   acctMgr.accountUriFor('alice')
   *   // -> 'https://alice.example.com'
   *
   *   // in single user mode:
   *   acctMgr.accountUriFor()
   *   // -> 'https://example.com'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {TypeError} If `this.host` has not been initialized with serverUri,
   *   or if in multiUser mode and accountName is not provided.
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
   *   // in multi user mode:
   *   acctMgr.accountWebIdFor('alice')
   *   // -> 'https://alice.example.com/profile/card#me'
   *
   *   // in single user mode:
   *   acctMgr.accountWebIdFor()
   *   // -> 'https://example.com/profile/card#me'
   *   ```
   *
   * @param [accountName] {string}
   *
   * @throws {TypeError} via accountUriFor()
   *
   * @return {string}
   */
  accountWebIdFor (accountName) {
    let accountUri = this.accountUriFor(accountName)

    let webIdUri = url.parse(url.resolve(accountUri, this.pathCard))
    webIdUri.hash = this.suffixURI
    return webIdUri.format()
  }

  /**
   * @param certificate {WebIdTlsCertificate}
   * @param userAccount {UserAccount}
   *
   * @return {Promise}
   */
  addCertKeyToProfile (certificate, userAccount) {
    return this.getProfileGraphFor(userAccount)
      .then(profileGraph => {
        return this.addCertKeyToGraph(certificate, profileGraph)
      })
      .then(profileGraph => {
        return this.saveProfileGraph(profileGraph, userAccount)
      })
  }

  /**
   * Returns a parsed WebID Profile graph for a given user account.
   *
   * @param userAccount {UserAccount}
   * @param [contentType] {string} Content type of the profile to parse
   *
   * @throws {TypeError} If the user account's WebID is missing
   * @throws {Error} HTTP 404 error (via `getGraph()`) if the profile resource
   *   is not found
   *
   * @return {Promise<Graph>}
   */
  getProfileGraphFor (userAccount, contentType = DEFAULT_PROFILE_CONTENT_TYPE) {
    let webId = userAccount.webId
    if (!webId) {
      let error = new TypeError('Cannot fetch profile graph, missing WebId URI')
      error.status = 400
      return Promise.reject(error)
    }

    let uri = userAccount.profileUri

    return this.store.getGraph(uri, contentType)
  }

  /**
   * Serializes and saves a given graph to the user's WebID Profile (and returns
   * the original graph object, as it was before serialization).
   *
   * @param profileGraph {Graph}
   * @param userAccount {UserAccount}
   * @param [contentType] {string}
   *
   * @return {Promise<Graph>}
   */
  saveProfileGraph (profileGraph, userAccount, contentType = DEFAULT_PROFILE_CONTENT_TYPE) {
    let webId = userAccount.webId
    if (!webId) {
      let error = new TypeError('Cannot save profile graph, missing WebId URI')
      error.status = 400
      return Promise.reject(error)
    }

    let uri = userAccount.profileUri

    return this.store.putGraph(profileGraph, uri, contentType)
  }

  /**
   * Adds the certificate's Public Key related triples to a user's profile graph.
   *
   * @param certificate {WebIdTlsCertificate}
   * @param graph {Graph} Parsed WebID Profile graph
   *
   * @return {Graph}
   */
  addCertKeyToGraph (certificate, graph) {
    let webId = rdf.namedNode(certificate.webId)
    let key = rdf.namedNode(certificate.keyUri)
    let timeCreated = rdf.literal(certificate.date.toISOString(), ns.xsd('dateTime'))
    let modulus = rdf.literal(certificate.modulus, ns.xsd('hexBinary'))
    let exponent = rdf.literal(certificate.exponent, ns.xsd('int'))
    let title = rdf.literal('Created by solid-server')
    let label = rdf.literal(certificate.commonName)

    graph.add(webId, ns.cert('key'), key)
    graph.add(key, ns.rdf('type'), ns.cert('RSAPublicKey'))
    graph.add(key, ns.dct('title'), title)
    graph.add(key, ns.rdfs('label'), label)
    graph.add(key, ns.dct('created'), timeCreated)
    graph.add(key, ns.cert('modulus'), modulus)
    graph.add(key, ns.cert('exponent'), exponent)

    return graph
  }

  /**
   * @param userData {Object} Options hashmap, like req.body
   *
   * @throws {TypeError} (via accountWebIdFor) If in multiUser mode and no
   *   username passed
   *
   * @return {UserAccount}
   */
  userAccountFrom (userData) {
    let userConfig = {
      username: userData.username,
      email: userData.email,
      name: userData.name
    }
    userConfig.webId = userData.webid || this.accountWebIdFor(userData.username)
    return UserAccount.from(userConfig)
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
