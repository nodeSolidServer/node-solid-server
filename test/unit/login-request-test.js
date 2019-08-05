'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
const HttpMocks = require('node-mocks-http')

const AuthRequest = require('../../lib/requests/auth-request')
const { LoginRequest } = require('../../lib/requests/login-request')

const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')

const mockUserStore = {
  findUser: () => { return Promise.resolve(true) },
  matchPassword: (user, password) => { return Promise.resolve(user) }
}

const authMethod = 'oidc'
const host = SolidHost.from({ serverUri: 'https://localhost:8443' })
const accountManager = AccountManager.from({ host, authMethod })
const localAuth = { password: true, tls: true }

describe('LoginRequest', () => {
  describe('loginPassword()', () => {
    let res, req

    beforeEach(() => {
      req = {
        app: { locals: { oidc: { users: mockUserStore }, localAuth, accountManager } },
        body: { username: 'alice', password: '12345' }
      }
      res = HttpMocks.createResponse()
    })

    it('should create a LoginRequest instance', () => {
      let fromParams = sinon.spy(LoginRequest, 'fromParams')
      let loginStub = sinon.stub(LoginRequest, 'login')
        .returns(Promise.resolve())

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(fromParams).to.have.been.calledWith(req, res)
          fromParams.reset()
          loginStub.restore()
        })
    })

    it('should invoke login()', () => {
      let login = sinon.spy(LoginRequest, 'login')

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(login).to.have.been.called()
          login.reset()
        })
    })
  })

  describe('loginTls()', () => {
    let res, req

    beforeEach(() => {
      req = {
        connection: {},
        app: { locals: { localAuth, accountManager } }
      }
      res = HttpMocks.createResponse()
    })

    it('should create a LoginRequest instance', () => {
      return LoginRequest.loginTls(req, res)
        .then(() => {
          expect(LoginRequest.fromParams).to.have.been.calledWith(req, res)
          LoginRequest.fromParams.reset()
          LoginRequest.login.reset()
        })
    })

    it('should invoke login()', () => {
      return LoginRequest.loginTls(req, res)
        .then(() => {
          expect(LoginRequest.login).to.have.been.called()
          LoginRequest.login.reset()
        })
    })
  })

  describe('fromParams()', () => {
    let session = {}
    let req = {
      session,
      app: { locals: { accountManager } },
      body: { username: 'alice', password: '12345' }
    }
    let res = HttpMocks.createResponse()

    it('should return a LoginRequest instance', () => {
      let request = LoginRequest.fromParams(req, res)

      expect(request.response).to.equal(res)
      expect(request.session).to.equal(session)
      expect(request.accountManager).to.equal(accountManager)
    })

    it('should initialize the query params', () => {
      let requestOptions = sinon.spy(AuthRequest, 'requestOptions')
      LoginRequest.fromParams(req, res)

      expect(requestOptions).to.have.been.calledWith(req)
    })
  })

  describe('login()', () => {
    let userStore = mockUserStore
    let response

    let options = {
      userStore,
      accountManager,
      localAuth: {}
    }

    beforeEach(() => {
      response = HttpMocks.createResponse()
    })

    it('should call initUserSession() for a valid user', () => {
      let validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      let request = new LoginRequest(options)

      let initUserSession = sinon.spy(request, 'initUserSession')

      return LoginRequest.login(request)
        .then(() => {
          expect(initUserSession).to.have.been.calledWith(validUser)
        })
    })

    it('should call redirectPostLogin()', () => {
      let validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      let request = new LoginRequest(options)

      let redirectPostLogin = sinon.spy(request, 'redirectPostLogin')

      return LoginRequest.login(request)
        .then(() => {
          expect(redirectPostLogin).to.have.been.calledWith(validUser)
        })
    })
  })

  describe('postLoginUrl()', () => {
    it('should return the user account uri if no redirect_uri param', () => {
      let request = new LoginRequest({ authQueryParams: {} })

      let aliceAccount = 'https://alice.example.com'
      let user = { accountUri: aliceAccount }

      expect(request.postLoginUrl(user)).to.equal(aliceAccount)
    })
  })

  describe('redirectPostLogin()', () => {
    it('should redirect to the /sharing url if response_type includes token', () => {
      let res = HttpMocks.createResponse()
      let authUrl = 'https://localhost:8443/sharing?response_type=token'
      let validUser = accountManager.userAccountFrom({ username: 'alice' })

      let authQueryParams = {
        response_type: 'token'
      }

      let options = { accountManager, authQueryParams, response: res }
      let request = new LoginRequest(options)

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(authUrl)
    })

    it('should redirect to account uri if no client_id present', () => {
      let res = HttpMocks.createResponse()
      let authUrl = 'https://localhost/authorize?redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback'
      let validUser = accountManager.userAccountFrom({ username: 'alice' })

      let authQueryParams = {}

      let options = { accountManager, authQueryParams, response: res }
      let request = new LoginRequest(options)

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      let expectedUri = accountManager.accountUriFor('alice')
      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(expectedUri)
    })

    it('should redirect to account uri if redirect_uri is string "undefined', () => {
      let res = HttpMocks.createResponse()
      let authUrl = 'https://localhost/authorize?client_id=123'
      let validUser = accountManager.userAccountFrom({ username: 'alice' })

      let body = { redirect_uri: 'undefined' }

      let options = { accountManager, response: res }
      let request = new LoginRequest(options)
      request.authQueryParams = AuthRequest.extractAuthParams({ body })

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      let expectedUri = accountManager.accountUriFor('alice')

      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(expectedUri)
    })
  })
})
