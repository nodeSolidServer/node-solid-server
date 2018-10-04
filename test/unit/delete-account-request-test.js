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
      let res = HttpMocks.createResponse()

      let options = {
        response: res,
        username: 'alice'
      }

      let request = new DeleteAccountRequest(options)

      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      let username = 'alice'
      let accountManager = {}

      let req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      let res = HttpMocks.createResponse()

      let request = DeleteAccountRequest.fromParams(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('get()', () => {
    it('should create an instance and render a delete account form', () => {
      let username = 'alice'
      let accountManager = { multiuser: true }

      let req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      let res = HttpMocks.createResponse()
      res.render = sinon.stub()

      DeleteAccountRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('account/delete',
        { error: undefined, multiuser: true })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(DeleteAccountRequest, 'handlePost')

      let username = 'alice'
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = {
        suffixAcl: '.acl'
      }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendDeleteLink = sinon.stub().resolves()

      let req = {
        app: { locals: { accountManager } },
        body: { username }
      }
      let res = HttpMocks.createResponse()

      DeleteAccountRequest.post(req, res)
        .then(() => {
          expect(DeleteAccountRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let accountManager = AccountManager.from({ host, multiuser: true })

      let request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let accountManager = AccountManager.from({ host, multiuser: false })

      let request = new DeleteAccountRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = { suffixAcl: '.acl' }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendDeleteAccountEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      let username = 'alice'
      let response = HttpMocks.createResponse()
      response.render = sinon.stub()

      let options = { accountManager, username, response }
      let request = new DeleteAccountRequest(options)

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
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = { suffixAcl: '.acl' }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      let username = 'alice'

      let options = { accountManager, username }
      let request = new DeleteAccountRequest(options)

      return request.loadUser()
        .then(account => {
          expect(account.webId).to.equal('https://alice.example.com/profile/card#me')
        })
    })

    it('should throw an error if the user does not exist', done => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = { suffixAcl: '.acl' }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(false)
      let username = 'alice'

      let options = { accountManager, username }
      let request = new DeleteAccountRequest(options)

      request.loadUser()
        .catch(error => {
          expect(error.message).to.equal('Account not found for that username')
          done()
        })
    })
  })
})
