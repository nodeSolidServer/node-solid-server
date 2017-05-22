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
      let res = HttpMocks.createResponse()

      let accountManager = {}
      let userStore = {}

      let options = {
        accountManager,
        userStore,
        returnToUrl: 'https://example.com/resource',
        response: res,
        token: '12345',
        newPassword: 'swordfish'
      }

      let request = new PasswordChangeRequest(options)

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
      let returnToUrl = 'https://example.com/resource'
      let token = '12345'
      let newPassword = 'swordfish'
      let accountManager = {}
      let userStore = {}

      let req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token },
        body: { newPassword }
      }
      let res = HttpMocks.createResponse()

      let request = PasswordChangeRequest.fromParams(req, res)

      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.newPassword).to.equal(newPassword)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('get()', () => {
    let returnToUrl = 'https://example.com/resource'
    let token = '12345'
    let userStore = {}
    let res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should create an instance and render a change password form', () => {
      let accountManager = {
        validateResetToken: sinon.stub().resolves(true)
      }
      let req = {
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
      let accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      let req = {
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

      let returnToUrl = 'https://example.com/resource'
      let token = '12345'
      let newPassword = 'swordfish'
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let alice = {
        webId: 'https://alice.example.com/#me'
      }
      let storedToken = { webId: alice.webId }
      let store = {
        findUser: sinon.stub().resolves(alice),
        updatePassword: sinon.stub()
      }
      let accountManager = {
        host,
        store,
        userAccountFrom: sinon.stub().resolves(alice),
        validateResetToken: sinon.stub().resolves(storedToken)
      }

      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()

      let req = {
        app: { locals: { accountManager, oidc: { users: store } } },
        query: { returnToUrl },
        body: { token, newPassword }
      }
      let res = HttpMocks.createResponse()

      return PasswordChangeRequest.post(req, res)
        .then(() => {
          expect(PasswordChangeRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('handlePost()', () => {
    it('should display error message if validation error encountered', () => {
      let returnToUrl = 'https://example.com/resource'
      let token = '12345'
      let userStore = {}
      let res = HttpMocks.createResponse()
      let accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      let req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { returnToUrl, token }
      }

      let request = PasswordChangeRequest.fromParams(req, res)

      return PasswordChangeRequest.handlePost(request)
        .then(() => {
          expect(PasswordChangeRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      let accountManager = {
        validateResetToken: sinon.stub()
      }
      let request = new PasswordChangeRequest({ accountManager, token: null })

      return request.validateToken()
        .then(result => {
          expect(result).to.be.false()
          expect(accountManager.validateResetToken).to.not.have.been.called()
        })
    })
  })

  describe('validatePost()', () => {
    it('should throw an error if no new password was entered', () => {
      let request = new PasswordChangeRequest({ newPassword: null })

      expect(() => request.validatePost()).to.throw('Please enter a new password')
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      let request = new PasswordChangeRequest({})
      request.renderForm = sinon.stub()
      let error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('changePassword()', () => {
    it('should create a new user store entry if none exists', () => {
      // this would be the case for legacy pre-user-store accounts
      let webId = 'https://alice.example.com/#me'
      let user = { webId, id: webId }
      let accountManager = {
        userAccountFrom: sinon.stub().returns(user)
      }
      let userStore = {
        findUser: sinon.stub().resolves(null),  // no user found
        createUser: sinon.stub().resolves(),
        updatePassword: sinon.stub().resolves()
      }

      let options = {
        accountManager, userStore, newPassword: 'swordfish'
      }
      let request = new PasswordChangeRequest(options)

      return request.changePassword(user)
        .then(() => {
          expect(userStore.createUser).to.have.been.calledWith(user, options.newPassword)
        })
    })
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      let returnToUrl = 'https://example.com/resource'
      let token = '12345'
      let response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      let options = { returnToUrl, token, response }

      let request = new PasswordChangeRequest(options)

      let error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('auth/change-password',
        { validToken: false, token, returnToUrl, error: 'error message' })
    })
  })
})
