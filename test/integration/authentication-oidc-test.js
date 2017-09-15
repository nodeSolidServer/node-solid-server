const Solid = require('../../index')
const path = require('path')
const fs = require('fs-extra')
const { UserStore } = require('oidc-auth-manager')
const UserAccount = require('../../lib/models/user-account')
const SolidAuthOIDC = require('solid-auth-oidc')

const fetch = require('node-fetch')
const localStorage = require('localstorage-memory')
const url = require('url')
const URL = require('whatwg-url').URL
global.URL = URL
global.URLSearchParams = require('whatwg-url').URLSearchParams

const supertest = require('supertest')
const nock = require('nock')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))

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
    webid: true,
    multiuser: false,
    configPath
  }

  const aliceRootPath = path.join(__dirname, '../resources/accounts-scenario/alice')
  const alicePod = Solid.createServer(
    Object.assign({
      root: aliceRootPath,
      serverUri: aliceServerUri,
      dbPath: aliceDbPath
    }, serverConfig)
  )
  const bobRootPath = path.join(__dirname, '../resources/accounts-scenario/bob')
  const bobPod = Solid.createServer(
    Object.assign({
      root: bobRootPath,
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
    fs.removeSync(path.join(aliceRootPath, 'index.html'))
    fs.removeSync(path.join(aliceRootPath, 'index.html.acl'))
    fs.removeSync(path.join(bobRootPath, 'index.html'))
    fs.removeSync(path.join(bobRootPath, 'index.html.acl'))
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

  describe('Login page (GET /login)', () => {
    it('should load the user login form', () => {
      return alice.get('/login')
        .expect(200)
    })
  })

  describe('Login by Username and Password (POST /login/password)', () => {
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

    describe('after performing a correct login', () => {
      let response, cookie
      before(done => {
        aliceUserStore.initCollections()
        aliceUserStore.createUser(aliceAccount, alicePassword)
        alice.post('/login/password')
          .type('form')
          .send({ username: 'alice' })
          .send({ password: alicePassword })
          .end((err, res) => {
            response = res
            cookie = response.headers['set-cookie'][0]
            done(err)
          })
      })

      it('should redirect to /authorize', () => {
        const loginUri = response.headers.location
        expect(response).to.have.property('status', 302)
        expect(loginUri.startsWith(aliceServerUri + '/authorize'))
      })

      it('should set the cookie', () => {
        expect(cookie).to.match(/connect.sid=/)
      })

      it('should set the cookie with HttpOnly', () => {
        expect(cookie).to.match(/HttpOnly/)
      })

      it('should set the cookie with Secure', () => {
        expect(cookie).to.match(/Secure/)
      })

      describe('and performing a subsequent request', () => {
        describe('without that cookie', () => {
          let response
          before(done => {
            alice.get('/')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        describe('with that cookie and a non-matching origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .set('Origin', bobServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        describe('with that cookie but without origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => {
            expect(response).to.have.property('status', 200)
          })
        })

        describe('with that cookie and a matching origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .set('Origin', aliceServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => {
            expect(response).to.have.property('status', 200)
          })
        })
      })
    })

    it('should throw a 400 if no username is provided', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ password: alicePassword })
        .expect(400, done)
    })

    it('should throw a 400 if no password is provided', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ username: 'alice' })
        .expect(400, done)
    })

    it('should throw a 400 if user is found but no password match', (done) => {
      alice.post('/login/password')
        .type('form')
        .send({ username: 'alice' })
        .send({ password: 'wrongpassword' })
        .expect(400, done)
    })
  })

  describe('Two Pods + Browser Login workflow', () => {
    // Step 1: Alice tries to access bob.com/shared-with-alice.txt, and
    //   gets redirected to bob.com's Provider Discovery endpoint
    it('401 Unauthorized -> redirect to provider discovery', (done) => {
      bob.get('/shared-with-alice.txt')
        .expect(401)
        .end((err, res) => {
          if (err) return done(err)
          let redirectString = 'http-equiv="refresh" ' +
            `content="0; url=${bobServerUri}/api/auth/select-provider`
          expect(res.text).to.match(new RegExp(redirectString))
          done()
        })
    })

    // Step 2: Alice enters her pod's URI to Bob's Provider Discovery endpoint
    it('Enter webId -> redirect to provider login', () => {
      return bob.post('/api/auth/select-provider')
        .send('webid=' + aliceServerUri)
        .expect(302)
        .then(res => {
          // Submitting select-provider form redirects to Alice's pod's /authorize
          let authorizeUri = res.header.location
          expect(authorizeUri.startsWith(aliceServerUri + '/authorize'))

          // Follow the redirect to /authorize
          let authorizePath = url.parse(authorizeUri).path
          return alice.get(authorizePath)
        })
        .then(res => {
          // Since alice not logged in to her pod, /authorize redirects to /login
          let loginUri = res.header.location
          expect(loginUri.startsWith('/login'))
        })
    })
  })

  describe('Two Pods + Web App Login Workflow', () => {
    let aliceAccount = UserAccount.from({ webId: aliceWebId })
    let alicePassword = '12345'

    let auth
    let authorizationUri, loginUri, authParams, callbackUri
    let loginFormFields = ''
    let bearerToken

    before(() => {
      auth = new SolidAuthOIDC({ store: localStorage, window: { location: {} } })
      let appOptions = {
        redirectUri: 'https://app.example.com/callback'
      }

      aliceUserStore.initCollections()

      return aliceUserStore.createUser(aliceAccount, alicePassword)
        .then(() => {
          return auth.registerClient(aliceServerUri, appOptions)
        })
        .then(registeredClient => {
          auth.currentClient = registeredClient
        })
    })

    after(() => {
      fs.removeSync(path.join(aliceDbPath, 'users/users'))
      fs.removeSync(path.join(aliceDbPath, 'oidc/op/tokens'))

      let clientId = auth.currentClient.registration['client_id']
      let registration = `_key_${clientId}.json`
      fs.removeSync(path.join(aliceDbPath, 'oidc/op/clients', registration))
    })

    // Step 1: An app makes a GET request and receives a 401
    it('should get a 401 error on a REST request to a protected resource', () => {
      return fetch(bobServerUri + '/shared-with-alice.txt')
        .then(res => {
          expect(res.status).to.equal(401)

          expect(res.headers.get('www-authenticate'))
            .to.equal(`Bearer realm="${bobServerUri}", scope="openid webid"`)
        })
    })

    // Step 2: App presents the Select Provider UI to user, determine the
    //   preferred provider uri (here, aliceServerUri), and constructs
    //   an authorization uri for that provider
    it('should determine the authorization uri for a preferred provider', () => {
      return auth.currentClient.createRequest({}, auth.store)
        .then(authUri => {
          authorizationUri = authUri

          expect(authUri.startsWith(aliceServerUri + '/authorize')).to.be.true()
        })
    })

    // Step 3: App redirects user to the authorization uri for login
    it('should redirect user to /authorize and /login', () => {
      return fetch(authorizationUri, { redirect: 'manual' })
        .then(res => {
          // Since user is not logged in, /authorize redirects to /login
          expect(res.status).to.equal(302)

          loginUri = new URL(res.headers.get('location'))
          expect(loginUri.toString().startsWith(aliceServerUri + '/login'))
            .to.be.true()

          authParams = loginUri.searchParams
        })
    })

    // Step 4: Pod returns a /login page with appropriate hidden form fields
    it('should display the /login form', () => {
      return fetch(loginUri.toString())
        .then(loginPage => {
          return loginPage.text()
        })
        .then(pageText => {
          // Login page should contain the relevant auth params as hidden fields

          authParams.forEach((value, key) => {
            let hiddenField = `<input type="hidden" name="${key}" id="${key}" value="${value}" />`

            let fieldRegex = new RegExp(hiddenField)

            expect(pageText).to.match(fieldRegex)

            loginFormFields += `${key}=` + encodeURIComponent(value) + '&'
          })
        })
    })

    // Step 5: User submits their username & password via the /login form
    it('should login via the /login form', () => {
      loginFormFields += `username=${'alice'}&password=${alicePassword}`

      return fetch(aliceServerUri + '/login/password', {
        method: 'POST',
        body: loginFormFields,
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        credentials: 'include'
      })
        .then(res => {
          expect(res.status).to.equal(302)
          let postLoginUri = res.headers.get('location')
          let cookie = res.headers.get('set-cookie')

          // Successful login gets redirected back to /authorize and then
          // back to app
          expect(postLoginUri.startsWith(aliceServerUri + '/authorize'))
            .to.be.true()

          return fetch(postLoginUri, { redirect: 'manual', headers: { cookie } })
        })
        .then(res => {
          // User gets redirected back to original app
          expect(res.status).to.equal(302)
          callbackUri = res.headers.get('location')
          expect(callbackUri.startsWith('https://app.example.com#'))
        })
    })

    // Step 6: Web App extracts tokens from the uri hash fragment, uses
    //  them to access protected resource
    it('should use id token from the callback uri to access shared resource', () => {
      auth.window.location.href = callbackUri

      let protectedResourcePath = bobServerUri + '/shared-with-alice.txt'

      return auth.initUserFromResponse(auth.currentClient)
        .then(webId => {
          expect(webId).to.equal(aliceWebId)

          return auth.issuePoPTokenFor(bobServerUri, auth.session)
        })
        .then(popToken => {
          bearerToken = popToken

          return fetch(protectedResourcePath, {
            headers: {
              'Authorization': 'Bearer ' + bearerToken
            }
          })
        })
        .then(res => {
          expect(res.status).to.equal(200)

          return res.text()
        })
        .then(contents => {
          expect(contents).to.equal('protected contents\n')
        })
    })

    it('should not be able to reuse the bearer token for bob server on another server', () => {
      let privateAliceResourcePath = aliceServerUri + '/private-for-alice.txt'

      return fetch(privateAliceResourcePath, {
        headers: {
          // This is Alice's bearer token with her own Web ID
          'Authorization': 'Bearer ' + bearerToken
        }
      })
        .then(res => {
          // It will get rejected; it was issued for Bob's server only
          expect(res.status).to.equal(403)
        })
    })
  })

  describe('Post-logout page (GET /goodbye)', () => {
    it('should load the post-logout page', () => {
      return alice.get('/goodbye')
        .expect(200)
    })
  })
})
