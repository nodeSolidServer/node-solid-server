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
      let res = HttpMocks.createResponse()

      let accountManager = {}
      let userStore = {}

      let options = {
        accountManager,
        userStore,
        response: res,
        token: '12345'
      }

      let request = new DeleteAccountConfirmRequest(options)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(options.token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      let token = '12345'
      let accountManager = {}
      let userStore = {}

      let req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }
      let res = HttpMocks.createResponse()

      let request = DeleteAccountConfirmRequest.fromParams(req, res)

      expect(request.response).to.equal(res)
      expect(request.token).to.equal(token)
      expect(request.accountManager).to.equal(accountManager)
      expect(request.userStore).to.equal(userStore)
    })
  })

  describe('get()', () => {
    let token = '12345'
    let userStore = {}
    let res = HttpMocks.createResponse()
    sinon.spy(res, 'render')

    it('should create an instance and render a delete account form', () => {
      let accountManager = {
        validateDeleteToken: sinon.stub().resolves(true)
      }
      let req = {
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
      let accountManager = {
        validateDeleteToken: sinon.stub().throws()
      }
      let req = {
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

      let token = '12345'
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
        validateDeleteToken: sinon.stub().resolves(storedToken)
      }

      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')

      // TODO: @kjetilk write in your stuff here - probably a stub

      let req = {
        app: { locals: { accountManager, oidc: { users: store } } },
        body: { token }
      }
      let res = HttpMocks.createResponse()

      return DeleteAccountConfirmRequest.post(req, res)
        .then(() => {
          expect(DeleteAccountConfirmRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('handlePost()', () => {
    it('should display error message if validation error encountered', () => {
      let token = '12345'
      let userStore = {}
      let res = HttpMocks.createResponse()
      let accountManager = {
        validateResetToken: sinon.stub().throws()
      }
      let req = {
        app: { locals: { accountManager, oidc: { users: userStore } } },
        query: { token }
      }

      let request = DeleteAccountConfirmRequest.fromParams(req, res)

      return DeleteAccountConfirmRequest.handlePost(request)
        .then(() => {
          expect(DeleteAccountConfirmRequest.prototype.error)
            .to.have.been.called()
        })
    })
  })

  describe('validateToken()', () => {
    it('should return false if no token is present', () => {
      let accountManager = {
        validateDeleteToken: sinon.stub()
      }
      let request = new DeleteAccountConfirmRequest({ accountManager, token: null })

      return request.validateToken()
        .then(result => {
          expect(result).to.be.false()
          expect(accountManager.validateDeleteToken).to.not.have.been.called()
        })
    })
  })

  describe('error()', () => {
    it('should invoke renderForm() with the error', () => {
      let request = new DeleteAccountConfirmRequest({})
      request.renderForm = sinon.stub()
      let error = new Error('error message')

      request.error(error)

      expect(request.renderForm).to.have.been.calledWith(error)
    })
  })

  describe('deleteAccount()', () => {
    // TODO: @kjetilk Write test when more is in place
  })

  describe('renderForm()', () => {
    it('should set response status to error status, if error exists', () => {
      let token = '12345'
      let response = HttpMocks.createResponse()
      sinon.spy(response, 'render')

      let options = { token, response }

      let request = new DeleteAccountConfirmRequest(options)

      let error = new Error('error message')

      request.renderForm(error)

      expect(response.render).to.have.been.calledWith('account/delete-confirm',
        { validToken: false, token, error: 'error message' })
    })
  })
})
