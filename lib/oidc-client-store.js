module.exports = class OIDCClientStore {
  constructor () {
    this.clients = {}
  }
  put (client) {
    return new Promise((resolve) => {
      this.clients[client.client.issuer] = client
      resolve()
    })
  }
  get (issuer) {
    return new Promise((resolve, reject) => {
      if (issuer in this.clients) {
        resolve(this.clients[issuer])
      } else {
        resolve(null)
      }
    })
  }
}
