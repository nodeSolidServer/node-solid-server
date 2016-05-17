const AnvilConnectExpress = require('connect-express')
const fs = require('fs')

module.exports = class OIDCClientStore {
  constructor () {
    this.clients = {}
  }
  put (client) {
    return new Promise((resolve, reject) => {
      if (!this.clients[client.client.issuer]) {
        this.clients[client.client.issuer] = client
        var data = {
          agentOptions: client.client.agentOptions,
          redirect_uri: client.client.redirect_uri,
          client_secret: client.client.client_secret,
          client_id: client.client.client_id,
          issuer: client.client.issuer,
          scope: client.client.scope,
          configuration: client.client.configuration,
          jwks: client.client.jwks,
          registration: client.client.registration
        }
        fs.writeFile(`oidc-client-${client.client.issuer}.json`, JSON.stringify(data), (err) => {
          if (err) return reject()
        })
        resolve()
      }
    })
  }
  get (issuer) {
    return new Promise((resolve, reject) => {
      if (issuer in this.clients) {
        return resolve(this.clients[issuer])
      }

      fs.readFile(`oidc-client-${issuer}.json`, (err, data) => {
        if (err) {
          resolve(null)
        }
        const json = JSON.parse(data)
        const client = new AnvilConnectExpress()
        client.client.agentOptions = json.agentOptions
        client.client.redirect_uri = json.redirect_uri
        client.client.client_secret = json.client_secret
        client.client.client_id = json.client_id
        client.client.issuer = json.issuer
        client.client.scope = json.scope
        client.client.configuration = json.configuration
        client.client.jwks = json.jwks
        client.client.registration = json.registration
        this.clients[issuer] = client
        resolve(client)
      })
    })
  }
}
