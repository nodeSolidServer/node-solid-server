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
      const fromParams = sinon.spy(LoginRequest, 'fromParams')
      const loginStub = sinon.stub(LoginRequest, 'login')
        .returns(Promise.resolve())

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(fromParams).to.have.been.calledWith(req, res)
          fromParams.resetHistory()
          loginStub.restore()
        })
    })

    it('should invoke login()', () => {
      const login = sinon.spy(LoginRequest, 'login')

      return LoginRequest.loginPassword(req, res)
        .then(() => {
          expect(login).to.have.been.called()
          login.resetHistory()
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
          LoginRequest.fromParams.resetHistory()
          LoginRequest.login.resetHistory()
        })
    })

    it('should invoke login()', () => {
      return LoginRequest.loginTls(req, res)
        .then(() => {
          expect(LoginRequest.login).to.have.been.called()
          LoginRequest.login.resetHistory()
        })
    })
  })

  describe('fromParams()', () => {
    const session = {}
    const req = {
      session,
      app: { locals: { accountManager } },
      body: { username: 'alice', password: '12345' }
    }
    const res = HttpMocks.createResponse()

    it('should return a LoginRequest instance', () => {
      const request = LoginRequest.fromParams(req, res)

      expect(request.response).to.equal(res)
      expect(request.session).to.equal(session)
      expect(request.accountManager).to.equal(accountManager)
    })

    it('should initialize the query params', () => {
      const requestOptions = sinon.spy(AuthRequest, 'requestOptions')
      LoginRequest.fromParams(req, res)

      expect(requestOptions).to.have.been.calledWith(req)
    })
  })

  describe('login()', () => {
    const userStore = mockUserStore
    let response

    const options = {
      userStore,
      accountManager,
      localAuth: {}
    }

    beforeEach(() => {
      response = HttpMocks.createResponse()
    })

    it('should call initUserSession() for a valid user', () => {
      const validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      const request = new LoginRequest(options)

      const initUserSession = sinon.spy(request, 'initUserSession')

      return LoginRequest.login(request)
        .then(() => {
          expect(initUserSession).to.have.been.calledWith(validUser)
        })
    })

    it('should call redirectPostLogin()', () => {
      const validUser = {}
      options.response = response
      options.authenticator = {
        findValidUser: sinon.stub().resolves(validUser)
      }

      const request = new LoginRequest(options)

      const redirectPostLogin = sinon.spy(request, 'redirectPostLogin')

      return LoginRequest.login(request)
        .then(() => {
          expect(redirectPostLogin).to.have.been.calledWith(validUser)
        })
    })
  })

  describe('postLoginUrl()', () => {
    it('should return the user account uri if no redirect_uri param', () => {
      const request = new LoginRequest({ authQueryParams: {} })

      const aliceAccount = 'https://alice.example.com'
      const user = { accountUri: aliceAccount }

      expect(request.postLoginUrl(user)).to.equal(aliceAccount)
    })
  })

  describe('redirectPostLogin()', () => {
    it('should redirect to the /sharing url if response_type includes token', () => {
      const res = HttpMocks.createResponse()
      const authUrl = 'https://localhost:8443/sharing?response_type=token'
      const validUser = accountManager.userAccountFrom({ username: 'alice' })

      const authQueryParams = {
        response_type: 'token'
      }

      const options = { accountManager, authQueryParams, response: res }
      const request = new LoginRequest(options)

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(authUrl)
    })

    it('should redirect to account uri if no client_id present', () => {
      const res = HttpMocks.createResponse()
      const authUrl = 'https://localhost/authorize?redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback'
      const validUser = accountManager.userAccountFrom({ username: 'alice' })

      const authQueryParams = {}

      const options = { accountManager, authQueryParams, response: res }
      const request = new LoginRequest(options)

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      const expectedUri = accountManager.accountUriFor('alice')
      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(expectedUri)
    })

    it('should redirect to account uri if redirect_uri is string "undefined', () => {
      const res = HttpMocks.createResponse()
      const authUrl = 'https://localhost/authorize?client_id=123'
      const validUser = accountManager.userAccountFrom({ username: 'alice' })

      const body = { redirect_uri: 'undefined' }

      const options = { accountManager, response: res }
      const request = new LoginRequest(options)
      request.authQueryParams = AuthRequest.extractAuthParams({ body })

      request.authorizeUrl = sinon.stub().returns(authUrl)

      request.redirectPostLogin(validUser)

      const expectedUri = accountManager.accountUriFor('alice')

      expect(res.statusCode).to.equal(302)
      expect(res._getRedirectUrl()).to.equal(expectedUri)
    })
  })
})
