const Solid = require('../../index')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
// In this test we always assume that we are Alice

describe('API', () => {
  let aliceServer
  let alice
  let serverUri = 'https://localhost:5000'

  const alicePod = Solid.createServer({
    root: path.join(__dirname, '../resources/accounts-scenario/alice'),
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    serverUri,
    dataBrowser: false,
    fileBrowser: false,
    webid: true
  })

  before((done) => {
    aliceServer = alicePod.listen(5000, done)
    alice = supertest(serverUri)
  })

  after(() => {
    if (aliceServer) aliceServer.close()
  })

  describe('Capability Discovery', () => {
    describe('GET Service Capability document', () => {
      it('should exist', (done) => {
        alice.get('/.well-known/solid')
          .expect(200, done)
      })
      it('should be a json file by default', (done) => {
        alice.get('/.well-known/solid')
          .expect('content-type', /application\/json/)
          .expect(200, done)
      })
      it('includes a root element', (done) => {
        alice.get('/.well-known/solid')
          .end(function (err, req) {
            expect(req.body.root).to.exist
            return done(err)
          })
      })
      it('includes an apps config section', (done) => {
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

    describe('OPTIONS API', () => {
      it('should return the service Link header', (done) => {
        alice.options('/')
          .expect('Link', /<.*\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })

      it('should still have previous link headers', (done) => {
        alice.options('/')
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
          .expect(204, done)
      })

      it('should return the oidc.provider Link header', (done) => {
        alice.options('/')
          .expect('Link', /<https:\/\/localhost:5000>; rel="oidc.provider"/)
          .expect(204, done)
      })
    })
  })
})
