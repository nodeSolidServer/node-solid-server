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

const PasswordResetEmailRequest = require('../../lib/requests/password-reset-email-request')
const AccountManager = require('../../lib/models/account-manager')
const SolidHost = require('../../lib/models/solid-host')

describe('PasswordResetEmailRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      let res = HttpMocks.createResponse()

      let options = {
        returnToUrl: 'https://example.com/resource',
        response: res,
        username: 'alice'
      }

      let request = new PasswordResetEmailRequest(options)

      expect(request.returnToUrl).to.equal(options.returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      let returnToUrl = 'https://example.com/resource'
      let username = 'alice'
      let accountManager = {}

      let req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      let res = HttpMocks.createResponse()

      let request = PasswordResetEmailRequest.fromParams(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('get()', () => {
    it('should create an instance and render a reset password form', () => {
      let returnToUrl = 'https://example.com/resource'
      let username = 'alice'
      let accountManager = { multiuser: true }

      let req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      let res = HttpMocks.createResponse()
      res.render = sinon.stub()

      PasswordResetEmailRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('auth/reset-password',
        { returnToUrl, multiuser: true })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(PasswordResetEmailRequest, 'handlePost')

      let returnToUrl = 'https://example.com/resource'
      let username = 'alice'
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = {
        suffixAcl: '.acl'
      }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()

      let req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      let res = HttpMocks.createResponse()

      PasswordResetEmailRequest.post(req, res)
        .then(() => {
          expect(PasswordResetEmailRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let accountManager = AccountManager.from({ host, multiuser: true })

      let request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let accountManager = AccountManager.from({ host, multiuser: false })

      let request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', () => {
      let host = SolidHost.from({ serverUri: 'https://example.com' })
      let store = { suffixAcl: '.acl' }
      let accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      let returnToUrl = 'https://example.com/resource'
      let username = 'alice'
      let response = HttpMocks.createResponse()
      response.render = sinon.stub()

      let options = { accountManager, username, returnToUrl, response }
      let request = new PasswordResetEmailRequest(options)

      sinon.spy(request, 'error')

      return PasswordResetEmailRequest.handlePost(request)
        .then(() => {
          expect(accountManager.loadAccountRecoveryEmail).to.have.been.called()
          expect(accountManager.sendPasswordResetEmail).to.have.been.called()
          expect(response.render).to.have.been.calledWith('auth/reset-link-sent')
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
      let request = new PasswordResetEmailRequest(options)

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
      let request = new PasswordResetEmailRequest(options)

      request.loadUser()
        .catch(error => {
          expect(error.message).to.equal('Account not found for that username')
          done()
        })
    })
  })
})
