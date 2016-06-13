const Solid = require('../')
const parallel = require('run-parallel')
const path = require('path')
const hippie = require('hippie')
const fs = require('fs')
// In this test we always assume that we are Alice

describe('Messages API', () => {
  let aliceServer

  const peterCert = {
    cert: fs.readFileSync(path.join(__dirname, '/keys/user1-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, '/keys/user1-key.pem'))
  }
  const aliceCert = {
    cert: fs.readFileSync(path.join(__dirname, '/keys/user1-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, '/keys/user1-key.pem'))
  }

  const alicePod = Solid.createServer({
    root: path.join(__dirname, '/resources/accounts-scenario/alice'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    auth: 'tls',
    dataBrowser: false,
    fileBrowser: false,
    webid: true
  })

  before(function (done) {
    parallel([
      (cb) => {
        aliceServer = alicePod.listen(5000, cb)
      }
    ], done)
  })

  after(function () {
    if (aliceServer) aliceServer.close()
  })

  describe('endpoints', () => {
    describe('/api/messages', () => {
      it('should send 401 if user is not logged in', (done) => {
        hippie()
          .post('https://localhost:5000/api/messages')
          .expectStatus(401)
          .end(done)
      })
    })
    describe('/api/messages', () => {
      it('should send 406 if message is missing', (done) => {
        hippie()
          // .json()
          .use(function (options, next) {
            options.agentOptions = peterCert
            options.strictSSL = false
            next(options)
          })
          .post('https://localhost:5000/api/messages')
          .expectStatus(406)
          .end(done)
      })
    })
    describe('/api/messages', () => {
      it('should send 403 user is not of this IDP', (done) => {
        hippie()
          // .json()
          .use(function (options, next) {
            options.agentOptions = peterCert
            options.strictSSL = false
            next(options)
          })
          .form()
          .send({message: 'thisisamessage'})
          .post('https://localhost:5000/api/messages')
          .expectStatus(403)
          .end(done)
      })
    })
  })
})
