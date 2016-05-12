'use strict'
var express = require('express')

const OIDClientStore = require('./oidc-client-store')
const OIDCExpressClient = require('anvil-connect-express')
var debug = require('./debug')

/**
 * OIDC Provider
 * Usage:
 *
 *   ```
 *   var providerConfig = {
 *     issuer: 'https://oidc.local',
 *     client_id: 'CLIENT_ID',
 *     client_secret: 'CLIENT_SECRET',
 *     redirect_uri: 'https://ldnode.local:8443/api/oidc/rp'
 *   }
 *   var oidcRpClient = new OidcRpClient()
 *   oidcRpClient.ensureTrustedClient(providerConfig)
 *   ```
 * @class OidcRpClient
 */
module.exports = class OidcRpClient {
  /**
   * @constructor
   * @param [clientStore] {OIDClientStore}
   */
  constructor (clientStore) {
    this.clients = clientStore || new OIDClientStore()
    this.trustedClient = new OIDCExpressClient()
  }

  /**
   * Ensures that the client for the server's trusted OIDC provider exists in
   * the client store. If it doesn't exist, this method creates, initializes,
   * and registers such a client, and stores it in the client store.
   * @param providerConfig {Object} Provider options (client store, local creds)
   * @return {Promise}
   */
  ensureTrustedClient (providerConfig) {
    const self = this
    const issuer = providerConfig.issuer
    debug.idp('Issuer: ' + issuer)
    self.clients.get(issuer)
      .then((client) => {
        debug.idp('Retrieved trusted client. Issuer: ' + issuer)
        if (client) {
          return  // trusted client already in store
        }
        debug.idp('Initializing trusted client.')
        return self.initClient(providerConfig)
          .then((client) => {
            debug.idp('Trusted client initialized.')
            self.trustedClient = client
          })
      })
  }

  clientForIssuer (issuer) {
    return this.clients.get(issuer)
      .then((client) => {
        debug.oidc('Client fetched for issuer.')
        if (client) {
          return client
        }
        debug.oidc('Client not present, initializing new client.')
        // client not already in store, create and register it
        let clientConfig = {
          issuer: issuer,
          redirect_uri: this.trustedClient.redirect_uri,
          scope: 'openid profile'
        }
        return this.initClient(clientConfig)
      })
  }

  /**
   * Returns an initialized (and registered) instance of an OIDC client for a
   * given set of credentials (issuer/client id, etc).
   * @param config {Object}
   * @return {Promise<OIDCExpressClient>} Initialized/registered api client
   */
  initClient (config) {
    var oidcExpress = new OIDCExpressClient(config)
    debug.idp('Running client.initProvider()...')
    return oidcExpress.client.initProvider()
      .then(() => {
        debug.idp('Client discovered, JWKs retrieved')
        if (!oidcExpress.client.client_id) {
          // Register if you haven't already.
          debug.idp('Registering client')
          return oidcExpress.client.register(this.registration)
        }
      })
      .then(() => {
        debug.idp('Storing registerd client')
        return this.clients.put(oidcExpress)
      })
      .then(() => oidcExpress)
      .catch((err) => { throw err })
  }

  authUrlForIssuer (issuer) {
    return this.clientForIssuer(issuer)
      .then((client) => {
        return this.urlForSignin(client)
      })
  }

  /**
   * Returns the Signin page URL for the trusted OIDC provider
   * @param client {OIDCExpressClient}
   * @returns {String}
   */
  urlForSignin (client) {
    // return 'https://anvil.local/authorize?stuff'
    var loginUrl = client.client.authorizationUri({
      endpoint: 'signin',
      nonce: '123',
      response_mode: 'query',
      response_type: 'token id_token',
      redirect_uri: client.redirect_uri
    })
    return loginUrl
  }
}
