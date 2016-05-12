const Solid = require('../')
const parallel = require('run-parallel')
const waterfall = require('run-waterfall')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
// In this test we always assume that we are Alice

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

describe('OIDC flow', () => {
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

  it('step1: User tries to get /foo and gets 401 and meta redirect', (done) => {
    getBobFoo(alice, bob, done)
  })

  it('step2: User enters webId to signin', (done) => {
    postBobDiscoverSignIn(alice, bob, done)
  })

  it('step3: User enters password', (done) => {
    entersPasswordAndConsent(alice, bob, done)
  })

  it('entire flow', (done) => {
    waterfall([
      (cb) => getBobFoo(alice, bob, cb),
      (cb) => postBobDiscoverSignIn(alice, bob, cb),
      (cb) => entersPasswordAndConsent(alice, bob, cb)
    ], done)
  })
})
