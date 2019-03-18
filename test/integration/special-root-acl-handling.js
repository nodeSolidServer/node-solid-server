const assert = require('chai').assert
const request = require('request')
const path = require('path')
const { checkDnsSettings, cleanDir } = require('../utils')

const ldnode = require('../../index')

const port = 7777
const serverUri = `https://localhost:${port}`
const root = path.join(__dirname, '../resources/accounts-acl')
const dbPath = path.join(root, 'db')
const configPath = path.join(root, 'config')

function createOptions (path = '') {
  return {
    url: `https://nicola.localhost:${port}${path}`
  }
}

describe('Special handling: Root ACL does not give READ access to root', () => {
  let ldp, ldpHttpsServer

  before(checkDnsSettings)

  before(done => {
    ldp = ldnode.createServer({
      root,
      serverUri,
      dbPath,
      port,
      configPath,
      sslKey: path.join(__dirname, '../keys/key.pem'),
      sslCert: path.join(__dirname, '../keys/cert.pem'),
      webid: true,
      multiuser: true,
      auth: 'oidc',
      strictOrigin: true,
      host: { serverUri }
    })
    ldpHttpsServer = ldp.listen(port, done)
  })

  after(() => {
    if (ldpHttpsServer) ldpHttpsServer.close()
    cleanDir(root)
  })

  describe('should still grant READ access to everyone because of index.html.acl', () => {
    it('for root with /', function (done) {
      var options = createOptions('/')
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('for root without /', function (done) {
      var options = createOptions()
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
  })
})
