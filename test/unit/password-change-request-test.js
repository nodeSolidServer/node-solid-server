'use strict'

const chai = require('chai')
const sinon = require('sinon')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const HttpMocks = require('node-mocks-http')

const PasswordChangeRequest = require('../../lib/requests/password-change-request')
const SolidHost = require('../../lib/models/solid-host')

describe('PasswordChangeRequest', () => {
  sinon.spy(PasswordChangeRequest.prototype, 'error')

  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const accountManager = {}
      const userStore = {}

      const options = {
        accountManager,
        userStore,
        returnToUrl: 'https://example.com/resource',
        response: res,
        token: '12345',
        newPassword: 'swordfish'
      }

      const request = new PasswordChangeRequest(options)

      expect(request.returnToUrl).to.equal(options.returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.token).to.equal(options.token)
      expect(request.newPassword).to.equal(options.newPassword)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const newPassword = 'swordfish'
      const accountManager = {}
      const userStore = {}

      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token },
        body: { newPassword }
      }
      const res = HttpMocks.createResponse()

      const request = PasswordChangeRequest.fromParams(req, res)

      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.newPassword).to.equal(newPassword)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('get()', () => {
    const returnToUrl = 'https://example.com/resource'
    const token = '12345'
    const userStore = {}
    const res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should create an instance and render a change password form', () => {
      const accountManager = {
        validateResetToken: sinon.stub().resolves(true)
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      return PasswordChangeRequest.get(req, res)
        .then(() => {
          expect(accountManager.validateResetToken)
            .to.have.been.called()
          expect(res.render).to.have.been.calledWith('auth/change-password',
            { returnToUrl, token, validToken: true })
        })
    })

    it('should display an error message on an invalid token', () => {
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      return PasswordChangeRequest.get(req, res)
        .then(() => {
          expect(PasswordChangeRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(PasswordChangeRequest, 'handlePost')

      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const newPassword = 'swordfish'
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const alice = {
        webId: 'https://alice.example.com/#me'
      }
      const storedToken = { webId: alice.webId }
      const store = {
        findUser: sinon.stub().resolves(alice),
        updatePassword: sinon.stub()
      }
      const accountManager = {
        host,
        store,
        userAccountFrom: sinon.stub().resolves(alice),
        validateResetToken: sinon.stub().resolves(storedToken)
      }

      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()

      const req = {
        app: { locals: { accountManager, oidc: { users: store } } },
        query: { returnToUrl },
        body: { token, newPassword }
      }
      const res = HttpMocks.createResponse()

      return PasswordChangeRequest.post(req, res)
        .then(() => {
          expect(PasswordChangeRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('handlePost()', () => {
    it('should display error message if validation error encountered', () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const userStore = {}
      const res = HttpMocks.createResponse()
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      const request = PasswordChangeRequest.fromParams(req, res)

      return PasswordChangeRequest.handlePost(request)
        .then(() => {
          expect(PasswordChangeRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      const accountManager = {
        validateResetToken: sinon.stub()
      }
      const request = new PasswordChangeRequest({ accountManager, token: null })

      return request.validateToken()
        .then(result => {
          expect(result).to.be.false()
          expect(accountManager.validateResetToken).to.not.have.been.called()
        })
    })
  })

  describe('validatePost()', () => {
    it('should throw an error if no new password was entered', () => {
      const request = new PasswordChangeRequest({ newPassword: null })

      expect(() => request.validatePost()).to.throw('Please enter a new password')
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      const request = new PasswordChangeRequest({})
      request.renderForm = sinon.stub()
      const error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('changePassword()', () => {
    it('should create a new user store entry if none exists', () => {
      // this would be the case for legacy pre-user-store accounts
      const webId = 'https://alice.example.com/#me'
      const user = { webId, id: webId }
      const accountManager = {
        userAccountFrom: sinon.stub().returns(user)
      }
      const userStore = {
        findUser: sinon.stub().resolves(null), // no user found
        createUser: sinon.stub().resolves(),
        updatePassword: sinon.stub().resolves()
      }

      const options = {
        accountManager, userStore, newPassword: 'swordfish'
      }
      const request = new PasswordChangeRequest(options)

      return request.changePassword(user)
        .then(() => {
          expect(userStore.createUser).to.have.been.calledWith(user, options.newPassword)
        })
    })
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      const returnToUrl = 'https://example.com/resource'
      const token = '12345'
      const response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      const options = { returnToUrl, token, response }

      const request = new PasswordChangeRequest(options)

      const error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('auth/change-password',
        { validToken: false, token, returnToUrl, error: 'error message' })
    })
  })
})
