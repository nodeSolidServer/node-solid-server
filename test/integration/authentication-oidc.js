const Solid = require('../../index')
const path = require('path')
const supertest = require('supertest')
const expect = require('chai').expect
const nock = require('nock')
const fs = require('fs-extra')
const { UserStore } = require('oidc-auth-manager')
const UserAccount = require('../../lib/models/user-account')

// In this test we always assume that we are Alice

describe('Authentication API (OIDC)', () => {
  let alice, aliceServer
  let bob, bobServer

  let aliceServerUri = 'https://localhost:7000'
  let aliceWebId = 'https://localhost:7000/profile/card#me'
  let configPath = path.join(__dirname, '../../config')
  let aliceDbPath = path.join(__dirname,
    '../resources/accounts-scenario/alice/db')
  let userStorePath = path.join(aliceDbPath, 'oidc/users')
  let aliceUserStore = UserStore.from({ path: userStorePath, saltRounds: 1 })
  aliceUserStore.initCollections()

  let bobServerUri = 'https://localhost:7001'
  let bobDbPath = path.join(__dirname,
    '../resources/accounts-scenario/bob/db')

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    fileBrowser: false,
    webid: true,
    idp: false,
    configPath
  }

  const alicePod = Solid.createServer(
    Object.assign({
      root: path.join(__dirname, '../resources/accounts-scenario/alice'),
      serverUri: aliceServerUri,
      dbPath: aliceDbPath
    }, serverConfig)
  )
  const bobPod = Solid.createServer(
    Object.assign({
      root: path.join(__dirname, '../resources/accounts-scenario/bob'),
      serverUri: bobServerUri,
      dbPath: bobDbPath
    }, serverConfig)
  )

  function startServer (pod, port) {
    return new Promise((resolve) => {
      pod.listen(port, () => { resolve() })
    })
  }

  before(() => {
    return Promise.all([
      startServer(alicePod, 7000),
      startServer(bobPod, 7001)
    ]).then(() => {
      alice = supertest(aliceServerUri)
      bob = supertest(bobServerUri)
    })
  })

  after(() => {
    if (aliceServer) aliceServer.close()
    if (bobServer) bobServer.close()
    fs.removeSync(path.join(aliceDbPath, 'oidc/users'))
  })

  describe('Provider Discovery (POST /api/auth/select-provider)', () => {
    it('form should load on a get', done => {
      alice.get('/api/auth/select-provider')
        .expect(200)
        .expect((res) => { res.text.match(/Provider Discovery/) })
        .end(done)
    })

    it('should complain if WebID URI is missing', (done) => {
      alice.post('/api/auth/select-provider')
        .expect(400, done)
    })

    it('should prepend https:// to webid, if necessary', (done) => {
      alice.post('/api/auth/select-provider')
        .type('form')
        .send({ webid: 'localhost:7000' })
        .expect(302, done)
    })

    it("should return a 400 if endpoint doesn't have Link Headers", (done) => {
      // Fake provider, replies with 200 and no Link headers
      nock('https://amazingwebsite.tld').intercept('/', 'OPTIONS').reply(204)

      alice.post('/api/auth/select-provider')
        .send('webid=https://amazingwebsite.tld/')
        .expect(400)
        .end(done)
    })

    it('should redirect user to discovered provider if valid uri', (done) => {
      bob.post('/api/auth/select-provider')
        .send('webid=' + aliceServerUri)
        .expect(302)
        .end((err, res) => {
          let loginUri = res.header.location
          expect(loginUri.startsWith(aliceServerUri + '/authorize'))
          done(err)
        })
    })
  })

  describe('Login by Username and Password (POST /login)', done => {
    // Logging in as alice, to alice's pod
    let aliceAccount = UserAccount.from({ webId: aliceWebId })
    let alicePassword = '12345'

    beforeEach(() => {
      aliceUserStore.initCollections()

      return aliceUserStore.createUser(aliceAccount, alicePassword)
        .catch(console.error.bind(console))
    })

    afterEach(() => {
      fs.removeSync(path.join(aliceDbPath, 'users/users'))
    })

    it('should login and be redirected to /authorize', (done) => {
      alice.post('/login')
        .type('form')
        .send({ username: 'alice' })
        .send({ password: alicePassword })
        .expect(302)
        .expect('set-cookie', /connect.sid/)
        .end((err, res) => {
          let loginUri = res.header.location
          expect(loginUri.startsWith(aliceServerUri + '/authorize'))
          done(err)
        })
    })

    it('should throw a 400 if no username is provided', (done) => {
      alice.post('/login')
        .type('form')
        .send({ password: alicePassword })
        .expect(400, done)
    })

    it('should throw a 400 if no password is provided', (done) => {
      alice.post('/login')
        .type('form')
        .send({ username: 'alice' })
        .expect(400, done)
    })

    it('should throw a 400 if user is found but no password match', (done) => {
      alice.post('/login')
        .type('form')
        .send({ username: 'alice' })
        .send({ password: 'wrongpassword' })
        .expect(400, done)
    })
  })

  describe('Login workflow', () => {
    // Step 1: Alice tries to access bob.com/foo, and
    //   gets redirected to bob.com's Provider Discovery endpoint
    it('401 Unauthorized -> redirect to provider discovery', (done) => {
      bob.get('/foo')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err)
          let redirectString = 'http-equiv="refresh" ' +
            `content="0; url=${bobServerUri}/api/auth/select-provider`
          expect(res.text).to.match(new RegExp(redirectString))
          done()
        })
    })

    // Step 2: Alice enters her WebID URI to the Provider Discovery endpoint
    it('Enter webId -> redirect to provider login', (done) => {
      bob.post('/api/auth/select-provider')
        .send('webid=' + aliceServerUri)
        .expect(302)
        .end((err, res) => {
          let loginUri = res.header.location
          expect(loginUri.startsWith(aliceServerUri + '/authorize'))
          done(err)
        })
    })

    it('At /login, enter WebID & password -> redirect back to /foo')
  })
})
