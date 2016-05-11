const Solid = require('../')
const parallel = require('run-parallel')
const waterfall = require('run-waterfall')
const path = require('path')
const supertest = require('supertest')

// In this test we always assume that we are Alice

function getBobFoo (alice, bob, done) {
  bob.get('/foo')
    .expect(401)
    .end(done)
}

function postBobDiscoverSignIn (alice, bob, done) {
  done()
}

function entersPasswordAndConsent (alice, bob, done) {

}

describe('OIDC flow', () => {
  let aliceServer
  let bobServer
  let alice
  let bob

  const solid = Solid.createServer({
    root: path.join(__dirname, '/resources'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    webid: true
  })

  before(function (done) {
    parallel([
      (cb) => {
        aliceServer = solid.listen(3456, cb)
        alice = supertest('https://localhost:3456')
      },
      (cb) => {
        bobServer = solid.listen(3457, cb)
        bob = supertest('https://localhost:3457')
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
