'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')
const url = require('url')

// const defaults = require('../../config/defaults')
const {
  // LoginRequest,
  LoginByPasswordRequest
} = require('../../lib/requests/login-request')

const UserAccount = require('../../lib/models/user-account')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')

const mockUserStore = {
  findUser: () => { return Promise.resolve(true) },
  matchPassword: (user, password) => { return Promise.resolve(user) }
}

const authMethod = 'oidc'
const host = SolidHost.from({ serverUri: 'https://localhost:8443' })
const accountManager = AccountManager.from({ host, authMethod })

describe('LoginByPasswordRequest', () => {
  describe('handle()', () => {
    let res, req

    beforeEach(() => {
      req = {
        app: { locals: { oidc: { users: mockUserStore }, accountManager } },
        body: { username: 'alice', password: '12345' }
      }
      res = HttpMocks.createResponse()
    })

    it('should create a LoginRequest instance', () => {
      let fromParams = sinon.spy(LoginByPasswordRequest, 'fromParams')
      let loginStub = sinon.stub(LoginByPasswordRequest, 'login')
        .returns(Promise.resolve())

      return LoginByPasswordRequest.handle(req, res)
        .then(() => {
          expect(fromParams).to.have.been.calledWith(req, res)
          fromParams.reset()
          loginStub.restore()
        })
        .catch(error => {
          fromParams.reset()
          loginStub.restore()
          throw error
        })
    })

    it('should invoke login()', () => {
      let login = sinon.spy(LoginByPasswordRequest, 'login')

      return LoginByPasswordRequest.handle(req, res)
        .then(() => {
          expect(login).to.have.been.called
          login.reset()
        })
    })
  })

  describe('fromParams()', () => {
    let session = {}
    let userStore = {}
    let req = {
      session,
      app: { locals: { oidc: { users: userStore }, accountManager } },
      body: { username: 'alice', password: '12345' }
    }
    let res = HttpMocks.createResponse()

    it('should return a LoginByPasswordRequest instance', () => {
      let request = LoginByPasswordRequest.fromParams(req, res)

      expect(request.username).to.equal('alice')
      expect(request.password).to.equal('12345')
      expect(request.response).to.equal(res)
      expect(request.session).to.equal(session)
      expect(request.userStore).to.equal(userStore)
      expect(request.accountManager).to.equal(accountManager)
    })

    it('should initialize the query params', () => {
      let extractQueryParams = sinon.spy(LoginByPasswordRequest, 'extractQueryParams')
      LoginByPasswordRequest.fromParams(req, res)

      expect(extractQueryParams).to.be.calledWith(req.body)
    })
  })

  describe('login()', () => {
    let userStore = mockUserStore
    let response

    beforeEach(() => {
      response = HttpMocks.createResponse()
    })

    it('should invoke validate()', () => {
      let request = new LoginByPasswordRequest({ userStore, accountManager, response })

      let validate = sinon.stub(request, 'validate')

      return LoginByPasswordRequest.login(request)
        .then(() => {
          expect(validate).to.have.been.called
        })
    })

    it('should call findValidUser()', () => {
      let request = new LoginByPasswordRequest({ userStore, accountManager, response })
      request.validate = sinon.stub()

      let findValidUser = sinon.spy(request, 'findValidUser')

      return LoginByPasswordRequest.login(request)
        .then(() => {
          expect(findValidUser).to.have.been.called
        })
    })

    it('should call initUserSession() for a valid user', () => {
      let validUser = {}
      let request = new LoginByPasswordRequest({ userStore, accountManager, response })

      request.validate = sinon.stub()
      request.findValidUser = sinon.stub().returns(Promise.resolve(validUser))

      let initUserSession = sinon.spy(request, 'initUserSession')

      return LoginByPasswordRequest.login(request)
        .then(() => {
          expect(initUserSession).to.have.been.calledWith(validUser)
        })
    })

    it('should call redirectToAuthorize()', () => {
      let validUser = {}
      let request = new LoginByPasswordRequest({ userStore, accountManager, response })

      request.validate = sinon.stub()
      request.findValidUser = sinon.stub().returns(Promise.resolve(validUser))

      let redirectToAuthorize = sinon.spy(request, 'redirectToAuthorize')

      return LoginByPasswordRequest.login(request)
        .then(() => {
          expect(redirectToAuthorize).to.have.been.called
        })
    })
  })

  describe('validate()', () => {
    it('should throw a 400 error if no username was provided', done => {
      let options = { username: null, password: '12345' }
      let request = new LoginByPasswordRequest(options)

      try {
        request.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        expect(error.message).to.equal('Username required')
        done()
      }
    })

    it('should throw a 400 error if no password was provided', done => {
      let options = { username: 'alice', password: null }
      let request = new LoginByPasswordRequest(options)

      try {
        request.validate()
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        expect(error.message).to.equal('Password required')
        done()
      }
    })
  })

  describe('findValidUser()', () => {
    it('should throw a 400 if no valid user is found in the user store', done => {
      let request = new LoginByPasswordRequest({ accountManager })

      request.userStore = {
        findUser: () => { return Promise.resolve(false) }
      }

      request.findValidUser()
        .catch(error => {
          expect(error.statusCode).to.equal(400)
          expect(error.message).to.equal('No user found for that username')
          done()
        })
    })

    it('should throw a 400 if user is found but password does not match', done => {
      let request = new LoginByPasswordRequest({ accountManager })

      request.userStore = {
        findUser: () => { return Promise.resolve(true) },
        matchPassword: () => { return Promise.resolve(false) }
      }

      request.findValidUser()
        .catch(error => {
          expect(error.statusCode).to.equal(400)
          expect(error.message).to.equal('User found but no password found')
          done()
        })
    })

    it('should return a valid user if one is found and password matches', () => {
      let webId = 'https://alice.example.com/#me'
      let validUser = { username: 'alice', webId }
      let request = new LoginByPasswordRequest({ accountManager })

      request.userStore = {
        findUser: () => { return Promise.resolve(validUser) },
        matchPassword: (user, password) => { return Promise.resolve(user) }
      }

      return request.findValidUser()
        .then(foundUser => {
          expect(foundUser.webId).to.equal(webId)
        })
    })

    describe('in Multi User mode', () => {
      let multiUser = true
      let serverUri = 'https://example.com'
      let host = SolidHost.from({ serverUri })
      let accountManager = AccountManager.from({ multiUser, host })
      let mockUserStore

      beforeEach(() => {
        mockUserStore = {
          findUser: () => { return Promise.resolve(true) },
          matchPassword: (user, password) => { return Promise.resolve(user) }
        }
      })

      it('should load user from store if provided with username', () => {
        let options = { username: 'alice', userStore: mockUserStore, accountManager }
        let request = new LoginByPasswordRequest(options)

        let storeFindUser = sinon.spy(request.userStore, 'findUser')
        let userStoreKey = 'alice.example.com/profile/card#me'

        return request.findValidUser()
          .then(() => {
            expect(storeFindUser).to.be.calledWith(userStoreKey)
          })
      })

      it('should load user from store if provided with WebID', () => {
        let webId = 'https://alice.example.com/profile/card#me'
        let options = { username: webId, userStore: mockUserStore, accountManager }
        let request = new LoginByPasswordRequest(options)

        let storeFindUser = sinon.spy(request.userStore, 'findUser')
        let userStoreKey = 'alice.example.com/profile/card#me'

        return request.findValidUser()
          .then(() => {
            expect(storeFindUser).to.be.calledWith(userStoreKey)
          })
      })
    })

    describe('in Single User mode', () => {
      let multiUser = false
      let serverUri = 'https://localhost:8443'
      let host = SolidHost.from({ serverUri })
      let accountManager = AccountManager.from({ multiUser, host })
      let mockUserStore

      beforeEach(() => {
        mockUserStore = {
          findUser: () => { return Promise.resolve(true) },
          matchPassword: (user, password) => { return Promise.resolve(user) }
        }
      })

      it('should load user from store if provided with username', () => {
        let options = { username: 'alice', userStore: mockUserStore, accountManager }
        let request = new LoginByPasswordRequest(options)

        let storeFindUser = sinon.spy(request.userStore, 'findUser')
        let userStoreKey = 'localhost:8443/profile/card#me'

        return request.findValidUser()
          .then(() => {
            expect(storeFindUser).to.be.calledWith(userStoreKey)
          })
      })

      it('should load user from store if provided with WebID', () => {
        let webId = 'https://localhost:8443/profile/card#me'
        let options = { username: webId, userStore: mockUserStore, accountManager }
        let request = new LoginByPasswordRequest(options)

        let storeFindUser = sinon.spy(request.userStore, 'findUser')
        let userStoreKey = 'localhost:8443/profile/card#me'

        return request.findValidUser()
          .then(() => {
            expect(storeFindUser).to.be.calledWith(userStoreKey)
          })
      })
    })
  })

  describe('initUserSession()', () => {
    it('should initialize the request session', () => {
      let webId = 'https://alice.example.com/#me'
      let alice = UserAccount.from({ username: 'alice', webId })
      let session = {}

      let request = new LoginByPasswordRequest({ session })

      request.initUserSession(alice)

      expect(request.session.userId).to.equal(webId)
      expect(request.session.identified).to.be.true
      let subject = request.session.subject
      expect(subject['_id']).to.equal(webId)
    })
  })

  function testAuthQueryParams () {
    let body = {}
    body['response_type'] = 'code'
    body['scope'] = 'openid'
    body['client_id'] = 'client1'
    body['redirect_uri'] = 'https://redirect.example.com/'
    body['state'] = '1234'
    body['nonce'] = '5678'
    body['display'] = 'page'

    return body
  }

  describe('extractQueryParams()', () => {
    let body = testAuthQueryParams()
    body['other_key'] = 'whatever'

    it('should initialize the auth url query object from params', () => {
      let extracted = LoginByPasswordRequest.extractQueryParams(body)

      for (let param of LoginByPasswordRequest.AUTH_QUERY_PARAMS) {
        expect(extracted[param]).to.equal(body[param])
      }

      // make sure *only* the listed params were copied
      expect(extracted['other_key']).to.not.exist
    })
  })

  describe('authorizeUrl()', () => {
    it('should return an /authorize url', () => {
      let request = new LoginByPasswordRequest({ accountManager })

      let authUrl = request.authorizeUrl()

      expect(authUrl.startsWith('https://localhost:8443/authorize')).to.be.true
    })

    it('should pass through relevant auth query params from request body', () => {
      let body = testAuthQueryParams()

      let request = new LoginByPasswordRequest({ accountManager })
      request.authQueryParams = LoginByPasswordRequest.extractQueryParams(body)

      let authUrl = request.authorizeUrl()

      let parseQueryString = true
      let parsedUrl = url.parse(authUrl, parseQueryString)

      for (let param in body) {
        expect(body[param]).to.equal(parsedUrl.query[param])
      }
    })
  })

  describe('redirectToAuthorize()', () => {
    it('should redirect to the /authorize url', () => {
      let res = HttpMocks.createResponse()
      let authUrl = 'https://localhost/authorize?client_id=123'

      let request = new LoginByPasswordRequest({ accountManager, response: res })

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectToAuthorize()

      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(authUrl)
    })
  })
})
