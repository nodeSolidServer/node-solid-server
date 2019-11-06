const Solid = require('../../index')
const path = require('path')
const fs = require('fs-extra')
const { UserStore } = require('@solid/oidc-auth-manager')
const UserAccount = require('../../lib/models/user-account')
const SolidAuthOIDC = require('@solid/solid-auth-oidc')

const fetch = require('node-fetch')
const localStorage = require('localstorage-memory')
const URL = require('whatwg-url').URL
global.URL = URL
global.URLSearchParams = require('whatwg-url').URLSearchParams
const { cleanDir, cp } = require('../utils')

const supertest = require('supertest')
const chai = require('chai')
const expect = chai.expect
chai.use(require('dirty-chai'))

// In this test we always assume that we are Alice

describe('Authentication API (OIDC) - With strict origins turned off', () => {
  let alice, bob

  const aliceServerPort = 7010
  const aliceServerUri = `https://localhost:${aliceServerPort}`
  const aliceWebId = `https://localhost:${aliceServerPort}/profile/card#me`
  let configPath = path.join(__dirname, '../resources/config')
  let aliceDbPath = path.join(__dirname, '../resources/accounts-strict-origin-off/alice/db')
  let userStorePath = path.join(aliceDbPath, 'oidc/users')
  let aliceUserStore = UserStore.from({ path: userStorePath, saltRounds: 1 })
  aliceUserStore.initCollections()

  const bobServerPort = 7011
  const bobServerUri = `https://localhost:${bobServerPort}`
  let bobDbPath = path.join(__dirname, '../resources/accounts-strict-origin-off/bob/db')

  const trustedAppUri = 'https://trusted.app'

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    webid: true,
    multiuser: false,
    configPath,
    strictOrigin: false
  }

  const aliceRootPath = path.join(__dirname, '../resources/accounts-strict-origin-off/alice')
  const alicePod = Solid.createServer(
    Object.assign({
      root: aliceRootPath,
      serverUri: aliceServerUri,
      dbPath: aliceDbPath
    }, serverConfig)
  )
  const bobRootPath = path.join(__dirname, '../resources/accounts-strict-origin-off/bob')
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

  before(async () => {
    await Promise.all([
      startServer(alicePod, aliceServerPort),
      startServer(bobPod, bobServerPort)
    ]).then(() => {
      alice = supertest(aliceServerUri)
      bob = supertest(bobServerUri)
    })
    cp(path.join('accounts-strict-origin-off/alice', '.acl-override'), path.join('accounts-strict-origin-off/alice', '.acl'))
    cp(path.join('accounts-strict-origin-off/bob', '.acl-override'), path.join('accounts-strict-origin-off/bob', '.acl'))
  })

  after(() => {
    alicePod.close()
    bobPod.close()
    fs.removeSync(path.join(aliceDbPath, 'oidc/users'))
    cleanDir(aliceRootPath)
    cleanDir(bobRootPath)
  })

  describe('Login page (GET /login)', () => {
    it('should load the user login form', () => alice.get('/login').expect(200))
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
        expect(cookie).to.match(/nssidp.sid=\S{65,100}/)
      })

      it('should set the cookie with HttpOnly', () => {
        expect(cookie).to.match(/HttpOnly/)
      })

      it('should set the cookie with Secure', () => {
        expect(cookie).to.match(/Secure/)
      })

      describe('and performing a subsequent request', () => {
        let response
        describe('without cookie', () => {
          describe('and no origin set', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and our origin', () => {
            // Our own origin, no agent auth
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Origin', aliceServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and trusted origin', () => {
            // Configuration for originsAllowed but no auth
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Origin', 'https://apps.solid.invalid')
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and untrusted origin', () => {
            // Not authenticated but also wrong origin,
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Origin', bobServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and trusted app', () => {
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
        })

        describe('with cookie', () => {
          describe('and no origin set', () => {
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
          describe('and our origin', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', cookie)
                   .set('Origin', aliceServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 200', () => expect(response).to.have.property('status', 200))
          })
          describe('and trusted origin', () => {
            before(done => {
              alice.get('/')
                   .set('Cookie', cookie)
                   .set('Origin', 'https://apps.solid.invalid') // TODO: Should we configure the server with that? Should it matter?
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and untrusted origin', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', cookie)
                   .set('Origin', bobServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            // Even if origin checking is disabled, then this should return a 401 because cookies should not be trusted cross-origin
            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })

          describe('and trusted app', () => {
            // Trusted apps are not supported when strictOrigin check is turned off
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', cookie)
                   .set('Origin', trustedAppUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
        })

        describe('with malicious cookie', () => {
          let malcookie
          before(() => {
            // How Mallory might set their cookie:
            malcookie = cookie.replace(/nssidp\.sid=(\S+)/, 'nssidp.sid=l33th4x0rzp0wn4g3;')
          })
          describe('and no origin set', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', malcookie)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and our origin', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', malcookie)
                   .set('Origin', aliceServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and trusted origin', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', malcookie)
                   .set('Origin', 'https://apps.solid.invalid')
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })
          describe('and untrusted origin', () => {
            before(done => {
              alice.get('/private-for-alice.txt')
                   .set('Cookie', malcookie)
                   .set('Origin', bobServerUri)
                   .end((err, res) => {
                     response = res
                     done(err)
                   })
            })

            it('should return a 401', () => expect(response).to.have.property('status', 401))
          })

          describe('and trusted app', () => {
            before(done => {
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
          expect(text).to.contain('Log in')
          done(err)
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
    let cookie
    let postLoginUri

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
          postLoginUri = res.headers.get('location')
          cookie = res.headers.get('set-cookie')

          // Successful login gets redirected back to /authorize and then
          // back to app
          expect(postLoginUri.startsWith(aliceServerUri + '/sharing'))
            .to.be.true()
        })
    })

    // Step 6: User consents to the app accessing certain things
    it('should consent via the /sharing form', () => {
      loginFormFields += `&access_mode=Read&access_mode=Write&consent=true`

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
    it('should use id token from the callback uri to access shared resource (no origin)', () => {
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
    it('should use id token from the callback uri to access shared resource (untrusted origin)', () => {
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
              'Authorization': 'Bearer ' + bearerToken,
              'Origin': 'https://untrusted.example.com' // shouldn't matter if strictOrigin is set to false
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
