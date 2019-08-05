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

const DeleteAccountRequest = require('../../lib/requests/delete-account-request')
const AccountManager = require('../../lib/models/account-manager')
const SolidHost = require('../../lib/models/solid-host')

describe('DeleteAccountRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const options = {
        response: res,
        username: 'alice'
      }

      const request = new DeleteAccountRequest(options)

      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      const username = 'alice'
      const accountManager = {}

      const req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      const request = DeleteAccountRequest.fromParams(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('get()', () => {
    it('should create an instance and render a delete account form', () => {
      const username = 'alice'
      const accountManager = { multiuser: true }

      const req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      const res = HttpMocks.createResponse()
      res.render = sinon.stub()

      DeleteAccountRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('account/delete',
        { error: undefined, multiuser: true })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(DeleteAccountRequest, 'handlePost')

      const username = 'alice'
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = {
        suffixAcl: '.acl'
      }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendDeleteLink = sinon.stub().resolves()

      const req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      DeleteAccountRequest.post(req, res)
        .then(() => {
          expect(DeleteAccountRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const accountManager = AccountManager.from({ host, multiuser: true })

      const request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const accountManager = AccountManager.from({ host, multiuser: false })

      const request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendDeleteAccountEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      const username = 'alice'
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const options = { accountManager, username, response }
      const request = new DeleteAccountRequest(options)

      sinon.spy(request, 'error')

      return DeleteAccountRequest.handlePost(request)
        .then(() => {
          expect(accountManager.loadAccountRecoveryEmail).to.have.been.called()
          expect(response.render).to.have.been.calledWith('account/delete-link-sent')
          expect(request.error).to.not.have.been.called()
        })
    })
  })

  describe('loadUser()', () => {
    it('should return a UserAccount instance based on username', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new DeleteAccountRequest(options)

      return request.loadUser()
        .then(account => {
          expect(account.webId).to.equal('https://alice.example.com/profile/card#me')
        })
    })

    it('should throw an error if the user does not exist', done => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(false)
      const username = 'alice'

      const options = { accountManager, username }
      const request = new DeleteAccountRequest(options)

      request.loadUser()
        .catch(error => {
          expect(error.message).to.equal('Account not found for that username')
          done()
        })
    })
  })
})
