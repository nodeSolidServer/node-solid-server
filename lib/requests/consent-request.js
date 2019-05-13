'use strict'

const debug = require('./../debug').authentication

const AuthRequest = require('./auth-request')

const url = require('url')
const intoStream = require('into-stream')

const $rdf = require('rdflib')
const ACL = $rdf.Namespace('http://www.w3.org/ns/auth/acl#')

/**
 * Models a local Login request
 */
class ConsentRequest extends AuthRequest {
  /**
   * @constructor
   * @param options {Object}
   *
   * @param [options.response] {ServerResponse} middleware `res` object
   * @param [options.session] {Session} req.session
   * @param [options.userStore] {UserStore}
   * @param [options.accountManager] {AccountManager}
   * @param [options.returnToUrl] {string}
   * @param [options.authQueryParams] {Object} Key/value hashmap of parsed query
   *   parameters that will be passed through to the /authorize endpoint.
   * @param [options.authenticator] {Authenticator} Auth strategy by which to
   *   log in
   */
  constructor (options) {
    super(options)

    this.authenticator = options.authenticator
    this.authMethod = options.authMethod
  }

  /**
   * Factory method, returns an initialized instance of LoginRequest
   * from an incoming http request.
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   * @param authMethod {string}
   *
   * @return {LoginRequest}
   */
  static fromParams (req, res) {
    let options = AuthRequest.requestOptions(req, res)

    return new ConsentRequest(options)
  }

  /**
   * Handles a Login GET request on behalf of a middleware handler, displays
   * the Login page.
   * Usage:
   *
   *   ```
   *   app.get('/login', LoginRequest.get)
   *   ```
   *
   * @param req {IncomingRequest}
   * @param res {ServerResponse}
   */
  static async get (req, res) {
    const request = ConsentRequest.fromParams(req, res)
    const appOrigin = request.getAppOrigin()
    // Check if is already registered or is data browser
    if (
      appOrigin === req.app.locals.ldp.serverUri ||
      await request.isAppRegistered(req.app.locals.ldp, appOrigin, request.authQueryParams.web_id)
    ) {
      request.redirectPostConsent()
    } else {
      request.renderForm(null, req)
    }
  }

  /**
   * Performs the login operation -- loads and validates the
   * appropriate user, inits the session with credentials, and redirects the
   * user to continue their auth flow.
   *
   * @param request {LoginRequest}
   *
   * @return {Promise}
   */
  static async giveConsent (req, res) {
    let accessModes = []
    let consented = false
    if (req.body) {
      accessModes = req.body.access_mode
      consented = req.body.consent
    }

    let request = ConsentRequest.fromParams(req, res)
    const appOrigin = request.getAppOrigin()
    debug('Providing consent for app sharing')

    if (consented) {
      await request.registerApp(req.app.locals.ldp, appOrigin, accessModes, request.authQueryParams.web_id)
    }

    console.log('oh no didnt update')
    // Redirect once that's all done
    return request.authenticator.findValidUser()
      .then(validUser => {
        request.initUserSession(validUser)
        request.redirectPostConsent(validUser)
      })

      .catch(error => request.error(error))
  }

  getAppOrigin () {
    const parsed = url.parse(this.authQueryParams.redirect_uri)
    return `${parsed.protocol}//${parsed.host}`
  }

  async getProfileGraph (ldp, webId) {
    return await new Promise(async (resolve, reject) => {
      const store = $rdf.graph()
      const profileText = await ldp.readResource(webId)
      $rdf.parse(profileText.toString(), store, 'https://localhost:8443/profile/card', 'text/turtle', (error, kb) => {
        if (error) {
          reject(error)
        } else {
          resolve(kb)
        }
      })
    })
  }

  async saveProfileGraph (ldp, store, webId) {
    const text = $rdf.serialize(undefined, store, webId, 'text/turtle')
    console.log(text)
    await ldp.put(webId, intoStream(text), 'text/turtle')
  }

  async isAppRegistered (ldp, appOrigin, webId) {
    const store = await this.getProfileGraph(ldp, webId)
    return store.each($rdf.sym(webId), ACL('trustedApp')).find((app) => {
      return store.each(app, ACL('origin')).find(rdfAppOrigin => rdfAppOrigin.value === appOrigin)
    })
  }

  async registerApp (ldp, appOrigin, accessModes, webId) {
    const store = await this.getProfileGraph(ldp, webId)
    const origin = $rdf.sym(appOrigin)
    // remove existing statements on same origin - if it exists
    store.statementsMatching(null, ACL('origin'), origin).forEach(st => {
      store.removeStatements([...store.statementsMatching(null, ACL('trustedApp'), st.subject)])
      store.removeStatements([...store.statementsMatching(st.subject)])
    })

    // add new triples
    const application = new $rdf.BlankNode()
    store.add($rdf.sym(webId), ACL('trustedApp'), application, webId)
    store.add(application, ACL('origin'), origin, webId)
    accessModes.forEach(mode => {
      store.add(application, ACL('mode'), ACL(mode))
    })
    console.log(store)
    await this.saveProfileGraph(ldp, store, webId)
  }

  /**
   * Returns a URL to redirect the user to after login.
   * Either uses the provided `redirect_uri` auth query param, or simply
   * returns the user profile URI if none was provided.
   *
   * @param validUser {UserAccount}
   *
   * @return {string}
   */
  postConsentUrl () {
    return this.authorizeUrl()
  }

  /**
   * Redirects the Login request to continue on the OIDC auth workflow.
   */
  redirectPostConsent () {
    let uri = this.postConsentUrl()
    debug('Login successful, redirecting to ', uri)
    this.response.redirect(uri)
  }

  /**
   * Renders the login form
   */
  renderForm (error, req) {
    let queryString = req && req.url && req.url.replace(/[^?]+\?/, '') || ''
    let params = Object.assign({}, this.authQueryParams,
      {
        registerUrl: this.registerUrl(),
        returnToUrl: this.returnToUrl,
        enablePassword: this.localAuth.password,
        enableTls: this.localAuth.tls,
        tlsUrl: `/login/tls?${encodeURIComponent(queryString)}`
      })

    if (error) {
      params.error = error.message
      this.response.status(error.statusCode)
    }

    this.response.render('auth/consent', params)
  }
}

module.exports = {
  ConsentRequest
}
