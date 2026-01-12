import ldnode from '../../index.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { UserStore } from '@solid/oidc-auth-manager'
import UserAccount from '../../lib/models/user-account.mjs'
import SolidAuthOIDC from '@solid/solid-auth-oidc'
import { WebSocket } from 'ws'

import localStorage from 'localstorage-memory'
import { URL, URLSearchParams } from 'whatwg-url'
import { cleanDir, cp } from '../utils.mjs'

import supertest from 'supertest'
import chai from 'chai'
import dirtyChai from 'dirty-chai'
global.URL = URL
global.URLSearchParams = URLSearchParams
const expect = chai.expect
chai.use(dirtyChai)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// In this test we always assume that we are Alice

// FIXME #1502
describe('Authentication API (OIDC)', () => {
  let alice, bob

  const aliceServerUri = 'https://localhost:7000'
  const aliceWebId = 'https://localhost:7000/profile/card#me'
  const configPath = path.normalize(path.join(__dirname, '../resources/config'))
  const aliceDbPath = path.normalize(path.join(__dirname,
    '../resources/accounts-scenario/alice/db'))
  const userStorePath = path.join(aliceDbPath, 'oidc/users')
  const aliceUserStore = UserStore.from({ path: userStorePath, saltRounds: 1 })
  aliceUserStore.initCollections()

  const bobServerUri = 'https://localhost:7001'
  const bobDbPath = path.normalize(path.join(__dirname,
    '../resources/accounts-scenario/bob/db'))

  const trustedAppUri = 'https://trusted.app'

  const serverConfig = {
    sslKey: path.normalize(path.join(__dirname, '../keys/key.pem')),
    sslCert: path.normalize(path.join(__dirname, '../keys/cert.pem')),
    auth: 'oidc',
    dataBrowser: false,
    webid: true,
    multiuser: false,
    configPath,
    trustedOrigins: ['https://apps.solid.invalid', 'https://trusted.app'],
    saltRounds: 1,
    live: true // Enable WebSocket support
  }

  const aliceRootPath = path.normalize(path.join(__dirname, '../resources/accounts-scenario/alice'))
  const bobRootPath = path.normalize(path.join(__dirname, '../resources/accounts-scenario/bob'))
  let alicePod
  let bobPod

  async function createPods () {
    alicePod = await ldnode.createServer(
      Object.assign({
        root: aliceRootPath,
        serverUri: aliceServerUri,
        dbPath: aliceDbPath
      }, serverConfig)
    )

    bobPod = await ldnode.createServer(
      Object.assign({
        root: bobRootPath,
        serverUri: bobServerUri,
        dbPath: bobDbPath
      }, serverConfig)
    )
  }

  function startServer (pod, port) {
    return new Promise((resolve, reject) => {
      pod.on('error', (err) => {
        console.error(`Server on port ${port} error:`, err)
        reject(err)
      })

      const server = pod.listen(port, () => {
        console.log(`Server started on port ${port}`)
        resolve()
      })

      server.on('error', (err) => {
        console.error(`Server listen error on port ${port}:`, err)
        reject(err)
      })
    })
  }

  before(async function () {
    this.timeout(60000) // 60 second timeout for server startup with OIDC initialization

    // Clean and recreate OIDC database directories to ensure fresh state
    const aliceOidcPath = path.join(aliceDbPath, 'oidc')
    const bobOidcPath = path.join(bobDbPath, 'oidc')

    // Remove any existing OIDC data to prevent corruption
    console.log('Cleaning OIDC directories...')
    fs.removeSync(aliceOidcPath)
    fs.removeSync(bobOidcPath)

    // Create fresh directory structure
    fs.ensureDirSync(path.join(aliceOidcPath, 'op/clients'))
    fs.ensureDirSync(path.join(aliceOidcPath, 'op/tokens'))
    fs.ensureDirSync(path.join(aliceOidcPath, 'op/codes'))
    fs.ensureDirSync(path.join(aliceOidcPath, 'users'))
    fs.ensureDirSync(path.join(aliceOidcPath, 'rp/clients'))

    fs.ensureDirSync(path.join(bobOidcPath, 'op/clients'))
    fs.ensureDirSync(path.join(bobOidcPath, 'op/tokens'))
    fs.ensureDirSync(path.join(bobOidcPath, 'op/codes'))
    fs.ensureDirSync(path.join(bobOidcPath, 'users'))
    fs.ensureDirSync(path.join(bobOidcPath, 'rp/clients'))

    await createPods()

    await Promise.all([
      startServer(alicePod, 7000),
      startServer(bobPod, 7001)
    ]).then(() => {
      alice = supertest(aliceServerUri)
      bob = supertest(bobServerUri)
    })
    cp(path.join('accounts-scenario/alice', '.acl-override'), path.join('accounts-scenario/alice', '.acl'))
    cp(path.join('accounts-scenario/bob', '.acl-override'), path.join('accounts-scenario/bob', '.acl'))
  })

  after(() => {
    alicePod.close()
    bobPod.close()
    fs.removeSync(path.join(aliceDbPath, 'oidc/users'))
    cleanDir(aliceRootPath)
    cleanDir(bobRootPath)
  })

  describe('Login page (GET /login)', () => {
    it('should load the user login form', () => {
      return alice.get('/login')
        .expect(200)
    })
  })

  describe('Login by Username and Password (POST /login/password)', () => {
    // Logging in as alice, to alice's pod
    const aliceAccount = UserAccount.from({ webId: aliceWebId })
    const alicePassword = '12345'

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
        expect(cookie).to.match(/nssidp.sid=\S{65,100}/)
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
            alice.get('/private-for-alice.txt')
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
            alice.get('/private-for-owner.txt')
              .set('Cookie', cookie)
              .set('Origin', bobServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 403', () => {
            expect(response).to.have.property('status', 403)
          })
        })

        describe('with that cookie and a non-matching origin', () => {
          let response
          before(done => {
            alice.get('/private-for-alice.txt')
              .set('Cookie', cookie)
              .set('Origin', bobServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 403', () => {
            expect(response).to.have.property('status', 403)
          })
        })

        describe('without that cookie and a non-matching origin', () => {
          let response
          before(done => {
            alice.get('/private-for-alice.txt')
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

        describe('with that cookie, private resource and no origin set', () => {
          before(done => {
            alice.get('/private-for-alice.txt')
              .set('Cookie', cookie)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => expect(response).to.have.property('status', 200))
        })

        // How Mallory might set their cookie:
        describe('with malicious cookie but without origin', () => {
          let response
          before(done => {
            const malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
            alice.get('/private-for-alice.txt')
              .set('Cookie', malcookie)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        // Our origin is trusted by default
        describe('with that cookie and our origin', () => {
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

        // Another origin isn't trusted by default
        describe('with that cookie and our origin', () => {
          let response
          before(done => {
            alice.get('/private-for-owner.txt')
              .set('Cookie', cookie)
              .set('Origin', 'https://some.other.domain.com')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 403', () => {
            expect(response).to.have.property('status', 403)
          })
        })

        // Our own origin, no agent auth
        describe('without that cookie but with our origin', () => {
          let response
          before(done => {
            alice.get('/private-for-owner.txt')
              .set('Origin', aliceServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        // Configuration for originsAllowed
        describe('with that cookie but with globally configured origin', () => {
          let response
          before(done => {
            alice.get('/')
              .set('Cookie', cookie)
              .set('Origin', 'https://apps.solid.invalid')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => {
            expect(response).to.have.property('status', 200)
          })
        })

        // Configuration for originsAllowed but no auth
        describe('without that cookie but with globally configured origin', () => {
          let response
          before(done => {
            alice.get('/private-for-alice.txt')
              .set('Origin', 'https://apps.solid.invalid')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        // Configuration for originsAllowed with malicious cookie
        describe('with malicious cookie but with globally configured origin', () => {
          let response
          before(done => {
            const malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
            alice.get('/private-for-alice.txt')
              .set('Cookie', malcookie)
              .set('Origin', 'https://apps.solid.invalid')
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        // Not authenticated but also wrong origin,
        // 403 because authenticating wouldn't help, since the Origin is wrong
        describe('without that cookie and a matching origin', () => {
          let response
          before(done => {
            alice.get('/private-for-owner.txt')
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

        // Authenticated but origin not OK
        describe('with that cookie and a non-matching origin', () => {
          let response
          before(done => {
            alice.get('/private-for-owner.txt')
              .set('Cookie', cookie)
              .set('Origin', bobServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 403', () => {
            expect(response).to.have.property('status', 403)
          })
        })

        describe('with malicious cookie and our origin', () => {
          let response
          before(done => {
            const malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
            alice.get('/private-for-alice.txt')
              .set('Cookie', malcookie)
              .set('Origin', aliceServerUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => {
            expect(response).to.have.property('status', 401)
          })
        })

        describe('with malicious cookie and a non-matching origin', () => {
          let response
          before(done => {
            const malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
            alice.get('/private-for-owner.txt')
              .set('Cookie', malcookie)
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

        describe('with trusted app and no cookie', () => {
          before(done => {
            alice.get('/private-for-alice.txt')
              .set('Origin', trustedAppUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => expect(response).to.have.property('status', 401))
        })

        describe('with trusted app and malicious cookie', () => {
          before(done => {
            const malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
            alice.get('/private-for-alice.txt')
              .set('Cookie', malcookie)
              .set('Origin', trustedAppUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 401', () => expect(response).to.have.property('status', 401))
        })

        describe('with trusted app and correct cookie', () => {
          before(done => {
            alice.get('/private-for-alice.txt')
              .set('Cookie', cookie)
              .set('Origin', trustedAppUri)
              .end((err, res) => {
                response = res
                done(err)
              })
          })

          it('should return a 200', () => expect(response).to.have.property('status', 200))
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

  describe('Browser login workflow', () => {
    it('401 Unauthorized asking the user to log in', (done) => {
      bob.get('/shared-with-alice.txt')
        .end((err, { status, text }) => {
          expect(status).to.equal(401)
          expect(text).to.contain('GlobalDashboard')
          done(err)
        })
    })
  })

  describe('Two Pods + Web App Login Workflow', () => {
    const aliceAccount = UserAccount.from({ webId: aliceWebId })
    const alicePassword = '12345'

    let auth
    let authorizationUri, loginUri, authParams, callbackUri
    let loginFormFields = ''
    let bearerToken
    let postLoginUri
    let cookie
    let postSharingUri

    before(function () {
      this.timeout(50000) // Long timeout for OIDC initialization

      auth = new SolidAuthOIDC({ store: localStorage, window: { location: {} } })
      const appOptions = {
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

      if (auth.currentClient && auth.currentClient.registration) {
        const clientId = auth.currentClient.registration.client_id
        const registration = `_key_${clientId}.json`
        fs.removeSync(path.join(aliceDbPath, 'oidc/op/clients', registration))
      }
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

          loginUri = new URL(res.headers.get('location'), aliceServerUri)
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
            const hiddenField = `<input type="hidden" name="${key}" id="${key}" value="${value}" />`

            const fieldRegex = new RegExp(hiddenField)

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
          const location = res.headers.get('location')
          postLoginUri = new URL(location, aliceServerUri).toString()
          // Native fetch: get first set-cookie header
          const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]
          cookie = setCookieHeaders[0]
          // Successful login gets redirected back to /authorize and then
          // back to app
          expect(postLoginUri.startsWith(aliceServerUri + '/sharing'))
            .to.be.true()
        })
    })

    // Step 6: User shares with the app accessing certain things
    it('should consent via the /sharing form', () => {
      loginFormFields += '&access_mode=Read&access_mode=Write&consent=true'

      return fetch(aliceServerUri + '/sharing', {
        method: 'POST',
        body: loginFormFields,
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie
        },
        credentials: 'include'
      })
        .then(res => {
          expect(res.status).to.equal(302)
          const location = res.headers.get('location')
          postSharingUri = new URL(location, aliceServerUri).toString()

          // cookie = res.headers.get('set-cookie')

          // Successful login gets redirected back to /authorize and then
          // back to app
          expect(postSharingUri.startsWith(aliceServerUri + '/authorize'))
            .to.be.true()
          return fetch(postSharingUri, { redirect: 'manual', headers: { cookie } })
        })
        .then(res => {
        // User gets redirected back to original app
          expect(res.status).to.equal(302)
          const location = res.headers.get('location')
          callbackUri = location.startsWith('http') ? location : new URL(location, aliceServerUri).toString()

          expect(callbackUri.startsWith('https://app.example.com#'))
        })
    })

    // Step 7: Web App extracts tokens from the uri hash fragment, uses
    //  them to access protected resource
    it('should use id token from the callback uri to access shared resource (no origin)', () => {
      auth.window.location.href = callbackUri

      const protectedResourcePath = bobServerUri + '/shared-with-alice.txt'

      return auth.initUserFromResponse(auth.currentClient)
        .then(webId => {
          expect(webId).to.equal(aliceWebId)

          return auth.issuePoPTokenFor(bobServerUri, auth.session)
        })
        .then(popToken => {
          bearerToken = popToken

          return fetch(protectedResourcePath, {
            headers: {
              Authorization: 'Bearer ' + bearerToken
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

    it('should use id token from the callback uri to access shared resource (untrusted origin)', () => {
      auth.window.location.href = callbackUri

      const protectedResourcePath = bobServerUri + '/shared-with-alice.txt'

      return auth.initUserFromResponse(auth.currentClient)
        .then(webId => {
          expect(webId).to.equal(aliceWebId)

          return auth.issuePoPTokenFor(bobServerUri, auth.session)
        })
        .then(popToken => {
          bearerToken = popToken

          return fetch(protectedResourcePath, {
            headers: {
              Authorization: 'Bearer ' + bearerToken,
              Origin: 'https://untrusted.example.com' // shouldn't be allowed if strictOrigin is set to true
            }
          })
        })
        .then(res => {
          expect(res.status).to.equal(403)
        })
    })

    it('should not be able to reuse the bearer token for bob server on another server', () => {
      const privateAliceResourcePath = aliceServerUri + '/private-for-alice.txt'

      return fetch(privateAliceResourcePath, {
        headers: {
          // This is Alice's bearer token with her own Web ID
          Authorization: 'Bearer ' + bearerToken
        }
      })
        .then(res => {
          // It will get rejected; it was issued for Bob's server only
          expect(res.status).to.equal(403)
        })
    })

    it('should allow Bearer token WebSocket subscription to private resource', function (done) {
      this.timeout(15000)

      // Issue a PoP token for Alice's server
      let aliceBearerToken

      auth.issuePoPTokenFor(aliceServerUri, auth.session)
        .then(popToken => {
          aliceBearerToken = popToken

          // Now connect to WebSocket with Bearer token
          const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'
          let completed = false

          const ws = new WebSocket(wsUrl, {
            rejectUnauthorized: false,
            headers: {
              Authorization: 'Bearer ' + aliceBearerToken
            }
          })

          ws.on('open', () => {
            ws.send('sub ' + aliceServerUri + '/private-for-alice.txt')
          })

          ws.on('message', (data) => {
            const message = data.toString()

            if (message.startsWith('ack ')) {
              expect(message).to.equal('ack ' + aliceServerUri + '/private-for-alice.txt')
              completed = true
              ws.close()
              done()
            } else if (message.startsWith('err ')) {
              completed = true
              ws.close()
              done(new Error('Bearer token authentication should allow access: ' + message))
            }
          })

          ws.on('error', (err) => {
            if (!completed) {
              completed = true
              done(err)
            }
          })

          ws.on('close', (code) => {
            if (!completed && code !== 1000) {
              completed = true
              done(new Error('WebSocket closed with error code: ' + code))
            }
          })
        })
        .catch(err => {
          done(err)
        })
    })

    it('should allow Bearer token WebSocket subscription to public resource', function (done) {
      this.timeout(15000)

      // Issue a PoP token for Alice's server
      let aliceBearerToken

      auth.issuePoPTokenFor(aliceServerUri, auth.session)
        .then(popToken => {
          aliceBearerToken = popToken

          // Now connect to WebSocket with Bearer token
          const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'
          let completed = false

          const ws = new WebSocket(wsUrl, {
            rejectUnauthorized: false,
            headers: {
              Authorization: 'Bearer ' + aliceBearerToken
            }
          })

          ws.on('open', () => {
            // Subscribe to public root resource
            ws.send('sub ' + aliceServerUri + '/')
          })

          ws.on('message', (data) => {
            const message = data.toString()

            if (message.startsWith('ack ')) {
              expect(message).to.equal('ack ' + aliceServerUri + '/')
              completed = true
              ws.close()
              done()
            } else if (message.startsWith('err ')) {
              completed = true
              ws.close()
              done(new Error('Bearer token should allow access to public resource: ' + message))
            }
          })

          ws.on('error', (err) => {
            if (!completed) {
              completed = true
              done(err)
            }
          })

          ws.on('close', (code) => {
            if (!completed && code !== 1000) {
              completed = true
              done(new Error('WebSocket closed with error code: ' + code))
            }
          })
        })
        .catch(err => {
          done(err)
        })
    })

    it('should degrade gracefully with invalid Bearer token', function (done) {
      this.timeout(10000)

      const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'
      let completed = false

      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers: {
          Authorization: 'Bearer invalid-token-xyz123'
        }
      })

      ws.on('open', () => {
        // Try to subscribe to private resource (should be denied like anonymous)
        ws.send('sub ' + aliceServerUri + '/private-for-alice.txt')
      })

      ws.on('message', (data) => {
        const message = data.toString()

        if (message.startsWith('err ') && message.includes('forbidden')) {
          // Should be denied access like an anonymous user
          expect(message).to.include(aliceServerUri + '/private-for-alice.txt')
          completed = true
          ws.close()
          done()
        } else if (message.startsWith('ack ')) {
          completed = true
          ws.close()
          done(new Error('Invalid Bearer token should not grant access: ' + message))
        }
      })

      ws.on('error', (err) => {
        if (!completed) {
          completed = true
          done(err)
        }
      })

      ws.on('close', (code) => {
        if (!completed && code !== 1000) {
          completed = true
          done(new Error('WebSocket closed with error code: ' + code))
        }
      })
    })
  })

  describe('Post-logout page (GET /goodbye)', () => {
    it('should load the post-logout page', () => {
      return alice.get('/goodbye')
        .expect(200)
    })
  })

  describe('WebSocket Authentication', () => {
    const aliceAccount = UserAccount.from({ webId: aliceWebId })
    const alicePassword = '12345'
    let cookie

    before(function (done) {
      this.timeout(10000)

      aliceUserStore.initCollections()
      aliceUserStore.createUser(aliceAccount, alicePassword)
        .then(() => {
          alice.post('/login/password')
            .type('form')
            .send({ username: 'alice' })
            .send({ password: alicePassword })
            .end((err, res) => {
              if (err) return done(err)
              cookie = res.headers['set-cookie'][0]
              done()
            })
        })
        .catch(done)
    })

    after(() => {
      fs.removeSync(path.join(aliceDbPath, 'users/users'))
    })

    it('should allow authenticated WebSocket subscription to private resource', function (done) {
      this.timeout(10000)

      const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'

      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers: {
          Cookie: cookie // Pass session cookie
        }
      })

      let completed = false

      ws.on('open', () => {
        // Subscribe to Alice's private resource immediately after connection
        ws.send('sub ' + aliceServerUri + '/private-for-alice.txt')
      })

      ws.on('message', (data) => {
        const message = data.toString()

        if (message.startsWith('ack ')) {
          // Subscription acknowledged - authenticated user has access
          expect(message).to.equal('ack ' + aliceServerUri + '/private-for-alice.txt')
          completed = true
          ws.close()
          done()
        } else if (message.startsWith('err ')) {
          // Subscription denied
          completed = true
          ws.close()
          done(new Error('Subscription should be allowed for authenticated user: ' + message))
        }
      })

      ws.on('error', (err) => {
        if (!completed) {
          completed = true
          done(err)
        }
      })

      ws.on('close', (code) => {
        if (!completed && code !== 1000) {
          completed = true
          done(new Error('WebSocket closed with error code: ' + code))
        }
      })
    })

    it('should deny anonymous WebSocket subscription to private resource', function (done) {
      this.timeout(10000)

      const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'

      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false
        // No cookie - anonymous connection
      })

      let completed = false

      ws.on('open', () => {
        // Try to subscribe to private resource without auth
        ws.send('sub ' + aliceServerUri + '/private-for-alice.txt')
      })

      ws.on('message', (data) => {
        const message = data.toString()

        if (message.startsWith('err ')) {
          // Should be denied
          expect(message).to.match(/err .+ forbidden/)
          completed = true
          ws.close()
          done()
        } else if (message.startsWith('ack ')) {
          // Should NOT be acknowledged
          completed = true
          ws.close()
          done(new Error('Anonymous user should not have access to private resource'))
        }
      })

      ws.on('error', (err) => {
        if (!completed) {
          completed = true
          done(err)
        }
      })

      ws.on('close', (code) => {
        if (!completed && code !== 1000) {
          completed = true
          done(new Error('WebSocket closed with error code: ' + code))
        }
      })
    })

    it('should allow authenticated subscription to public resource', function (done) {
      this.timeout(10000)

      const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'

      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers: {
          Cookie: cookie
        }
      })

      ws.on('open', () => {
        // Subscribe to public root immediately after connection
        ws.send('sub ' + aliceServerUri + '/')
      })

      ws.on('message', (data) => {
        const message = data.toString()

        if (message.startsWith('ack ')) {
          // Should be acknowledged
          expect(message).to.equal('ack ' + aliceServerUri + '/')
          ws.close()
          done()
        } else if (message.startsWith('err ')) {
          ws.close()
          done(new Error('Public resource should be accessible: ' + message))
        }
      })

      ws.on('error', (err) => {
        done(err)
      })
    })

    it('should allow anonymous subscription to public resource', function (done) {
      this.timeout(10000)

      const wsUrl = aliceServerUri.replace('https:', 'wss:') + '/.websocket'

      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false
        // No cookie - anonymous
      })

      ws.on('open', () => {
        // Subscribe to public root immediately after connection
        ws.send('sub ' + aliceServerUri + '/')
      })

      ws.on('message', (data) => {
        const message = data.toString()

        if (message.startsWith('ack ')) {
          // Should be acknowledged even for anonymous
          expect(message).to.equal('ack ' + aliceServerUri + '/')
          ws.close()
          done()
        } else if (message.startsWith('err ')) {
          ws.close()
          done(new Error('Public resource should be accessible to anonymous: ' + message))
        }
      })

      ws.on('error', (err) => {
        done(err)
      })
    })
  })
})
