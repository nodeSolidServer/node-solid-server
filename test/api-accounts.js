const Solid = require('../')
const parallel = require('run-parallel')
const waterfall = require('run-waterfall')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
const nock = require('nock')
// In this test we always assume that we are Alice

describe('Accounts API', () => {
  let aliceServer
  let bobServer
  let alice
  let bob

  const alicePod = Solid.createServer({
    root: path.join(__dirname, '/resources/accounts-scenario/alice'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    fileBrowser: false,
    webid: true
  })
  const bobPod = Solid.createServer({
    root: path.join(__dirname, '/resources/accounts-scenario/bob'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    fileBrowser: false,
    webid: true
  })

  function getBobFoo (alice, bob, done) {
    bob.get('/foo')
      .expect(401)
      .end((err, res) => {
        if (err) return done(err)
        expect(res).to.match(/META http-equiv="refresh"/)
        done()
      })
  }

  function postBobDiscoverSignIn (alice, bob, done) {
    done()
  }

  function entersPasswordAndConsent (alice, bob, done) {
    done()
  }

  before(function (done) {
    parallel([
      (cb) => {
        aliceServer = alicePod.listen(5000, cb)
        alice = supertest('https://localhost:5000')
      },
      (cb) => {
        bobServer = bobPod.listen(5001, cb)
        bob = supertest('https://localhost:5001')
      }
    ], done)
  })

  after(function () {
    if (aliceServer) aliceServer.close()
    if (bobServer) bobServer.close()
  })

  describe('endpoints', () => {
    describe('/api/accounts/signin', () => {
      it('should complain if a URL is missing', (done) => {
        alice.post('/api/accounts/signin')
          .expect(400)
          .end(done)
      })
      it('should complain if a URL is invalid', (done) => {
        alice.post('/api/accounts/signin')
          .send('webid=HELLO')
          .expect(400)
          .end(done)
      })
      it("should return a 400 if endpoint doesn't have Link Headers", (done) => {
        nock('https://amazingwebsite.tld').intercept('/', 'OPTIONS').reply(200)
        alice.post('/api/accounts/signin')
          .send('webid=https://amazingwebsite.tld/')
          .expect(400)
          .end(done)
      })
      it("should return a 400 if endpoint doesn't have oidc in the headers", (done) => {
        nock('https://amazingwebsite.tld')
          .intercept('/', 'OPTIONS')
          .reply(200, '', {
            'Link': function (req, res, body) {
              return '<https://oidc.amazingwebsite.tld>; rel="oidc.issuer"'
            }
          })
        alice.post('/api/accounts/signin')
          .send('webid=https://amazingwebsite.tld/')
          .expect(302)
          .end((err, res) => {
            expect(res.header.location).to.eql('https://oidc.amazingwebsite.tld')
            done(err)
          })
      })
    })
  })

  describe('Auth workflow', () => {
    it.skip('step1: User tries to get /foo and gets 401 and meta redirect', (done) => {
      getBobFoo(alice, bob, done)
    })

    it.skip('step2: User enters webId to signin', (done) => {
      postBobDiscoverSignIn(alice, bob, done)
    })

    it.skip('step3: User enters password', (done) => {
      entersPasswordAndConsent(alice, bob, done)
    })

    it.skip('entire flow', (done) => {
      waterfall([
        (cb) => getBobFoo(alice, bob, cb),
        (cb) => postBobDiscoverSignIn(alice, bob, cb),
        (cb) => entersPasswordAndConsent(alice, bob, cb)
      ], done)
    })
  })
})
