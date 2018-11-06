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

const DeleteAccountConfirmRequest = require('../../lib/requests/delete-account-confirm-request')
const SolidHost = require('../../lib/models/solid-host')

describe('DeleteAccountConfirmRequest', () => {
  sinon.spy(DeleteAccountConfirmRequest.prototype, 'error')

  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const accountManager = {}
      const userStore = {}

      const options = {
        accountManager,
        userStore,
        response: res,
        token: '12345'
      }

      const request = new DeleteAccountConfirmRequest(options)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(options.token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      const token = '12345'
      const accountManager = {}
      const userStore = {}

      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }
      const res = HttpMocks.createResponse()

      const request = DeleteAccountConfirmRequest.fromParams(req, res)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('get()', () => {
    const token = '12345'
    const userStore = {}
    const res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should create an instance and render a delete account form', () => {
      const accountManager = {
        validateDeleteToken: sinon.stub().resolves(true)
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      return DeleteAccountConfirmRequest.get(req, res)
        .then(() => {
          expect(accountManager.validateDeleteToken)
            .to.have.been.called()
          expect(res.render).to.have.been.calledWith('account/delete-confirm',
            { token, validToken: true })
        })
    })

    it('should display an error message on an invalid token', () => {
      const accountManager = {
        validateDeleteToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      return DeleteAccountConfirmRequest.get(req, res)
        .then(() => {
          expect(DeleteAccountConfirmRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(DeleteAccountConfirmRequest, 'handlePost')

      const token = '12345'
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const alice = {
        webId: 'https://alice.example.com/#me'
      }
      const storedToken = { webId: alice.webId }
      const accountManager = {
        host,
        userAccountFrom: sinon.stub().resolves(alice),
        validateDeleteToken: sinon.stub().resolves(storedToken)
      }

      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')

      const req = {
        app: { locals: { accountManager, oidc: { users: {} } } },
        body: { token }
      }
      const res = HttpMocks.createResponse()

      return DeleteAccountConfirmRequest.post(req, res)
        .then(() => {
          expect(DeleteAccountConfirmRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('handlePost()', () => {
    it('should display error message if validation error encountered', () => {
      const token = '12345'
      const userStore = {}
      const res = HttpMocks.createResponse()
      const accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      const req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      const request = DeleteAccountConfirmRequest.fromParams(req, res)

      return DeleteAccountConfirmRequest.handlePost(request)
        .then(() => {
          expect(DeleteAccountConfirmRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      const accountManager = {
        validateDeleteToken: sinon.stub()
      }
      const request = new DeleteAccountConfirmRequest({ accountManager, token: null })

      return request.validateToken()
        .then(result => {
          expect(result).to.be.false()
          expect(accountManager.validateDeleteToken).to.not.have.been.called()
        })
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      const request = new DeleteAccountConfirmRequest({})
      request.renderForm = sinon.stub()
      const error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('deleteAccount()', () => {
    it('should remove user from userStore and remove directories', () => {
      const webId = 'https://alice.example.com/#me'
      const user = { webId, id: webId }
      const accountManager = {
        userAccountFrom: sinon.stub().returns(user),
        accountDirFor: sinon.stub().returns('/some/path/to/data/for/alice.example.com/')
      }
      const userStore = {
        deleteUser: sinon.stub().resolves()
      }

      const options = {
        accountManager, userStore, newPassword: 'swordfish'
      }
      const request = new DeleteAccountConfirmRequest(options)
      const tokenContents = { webId }

      return request.deleteAccount(tokenContents)
        .then(() => {
          expect(accountManager.userAccountFrom).to.have.been.calledWith(tokenContents)
          expect(accountManager.accountDirFor).to.have.been.calledWith(user.username)
          expect(userStore.deleteUser).to.have.been.calledWith(user)
        })
    })
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      const token = '12345'
      const response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      const options = { token, response }

      const request = new DeleteAccountConfirmRequest(options)

      const error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('account/delete-confirm',
        { validToken: false, token, error: 'error message' })
    })
  })
})
