const Solid = require('../')
const parallel = require('run-parallel')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
// In this test we always assume that we are Alice

describe('API', () => {
  let aliceServer
  let alice

  const alicePod = Solid.createServer({
    root: path.join(__dirname, '/resources/accounts-scenario/alice'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    fileBrowser: false,
    webid: true
  })

  before(function (done) {
    parallel([
      (cb) => {
        aliceServer = alicePod.listen(5000, cb)
        alice = supertest('https://localhost:5000')
      }
    ], done)
  })

  after(function () {
    if (aliceServer) aliceServer.close()
  })

  describe('Capability Discovery', function () {
    describe('GET Service Capability document', function () {
      it('should exist', function (done) {
        alice.get('/.well-known/solid')
          .expect(200, done)
      })
      it('should be a json file by default', function (done) {
        alice.get('/.well-known/solid')
          .expect('content-type', /application\/json/)
          .expect(200, done)
      })
      it('includes a root element', function (done) {
        alice.get('/.well-known/solid')
          .end(function (err, req) {
            expect(req.body.root).to.exist
            return done(err)
          })
      })
      it('includes an apps config section', function (done) {
        const config = {
          apps: {
            'signin': '/signin/',
            'signup': '/signup/'
          }
        }
        const solid = Solid(config)
        let server = supertest(solid)
        server.get('/.well-known/solid')
          .end(function (err, req) {
            expect(req.body.apps).to.exist
            return done(err)
          })
      })
    })

    describe('OPTIONS API', function () {
      it('should set the service Link header', function (done) {
        alice.options('/')
          .expect('Link', /<.*\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })
      it('should still have previous link headers', function (done) {
        alice.options('/')
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
          .expect(204, done)
      })
    })
  })
})
