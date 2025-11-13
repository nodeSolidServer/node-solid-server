import { fileURLToPath } from 'url'
import path from 'path'
import { assert } from 'chai'
import { httpRequest as request, checkDnsSettings, cleanDir } from '../../test/utils.js'
import ldnode from '../../index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const port = 7777
const serverUri = `https://localhost:${port}`
const root = path.join(__dirname, '../../test/resources/accounts-acl')
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
      sslKey: path.join(__dirname, '../../test/keys/key.pem'),
      sslCert: path.join(__dirname, '../../test/keys/cert.pem'),
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
      const options = createOptions('/')
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('for root without /', function (done) {
      const options = createOptions()
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
  })
})