import chai from 'chai'
import sinon from 'sinon'
import dirtyChai from 'dirty-chai'
import sinonChai from 'sinon-chai'
import HttpMocks from 'node-mocks-http'

const { expect } = chai
chai.use(dirtyChai)
chai.use(sinonChai)
chai.should()

import PasswordResetEmailRequest from '../../lib/requests/password-reset-email-request.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'
import EmailService from '../../lib/services/email-service.mjs'

describe('PasswordResetEmailRequest', () => {
  describe('constructor()', () => {
    it('should initialize a request instance from options', () => {
      const res = HttpMocks.createResponse()

      const options = {
        returnToUrl: 'https://example.com/resource',
        response: res,
        username: 'alice'
      }

      const request = new PasswordResetEmailRequest(options)

      expect(request.returnToUrl).to.equal(options.returnToUrl)
      expect(request.response).to.equal(res)
      expect(request.username).to.equal(options.username)
    })
  })

  describe('fromParams()', () => {
    it('should return a request instance from options', () => {
      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const accountManager = {}

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      const request = PasswordResetEmailRequest.fromParams(req, res)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.returnToUrl).to.equal(returnToUrl)
      expect(request.username).to.equal(username)
      expect(request.response).to.equal(res)
    })
  })

  describe('get()', () => {
    it('should create an instance and render a reset password form', () => {
      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const accountManager = { multiuser: true }

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()
      res.render = sinon.stub()

      PasswordResetEmailRequest.get(req, res)

      expect(res.render).to.have.been.calledWith('auth/reset-password',
        { returnToUrl, multiuser: true })
    })
  })

  describe('post()', () => {
    it('creates a request instance and invokes handlePost()', () => {
      sinon.spy(PasswordResetEmailRequest, 'handlePost')

      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = {
        suffixAcl: '.acl'
      }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.accountExists = sinon.stub().resolves(true)
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()

      const req = {
        app: { locals: { accountManager } },
        query: { returnToUrl },
        body: { username }
      }
      const res = HttpMocks.createResponse()

      PasswordResetEmailRequest.post(req, res)
        .then(() => {
          expect(PasswordResetEmailRequest.handlePost).to.have.been.called()
        })
    })
  })

  describe('validate()', () => {
    it('should throw an error if username is missing in multi-user mode', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const accountManager = AccountManager.from({ host, multiuser: true })

      const request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.throw(/Username required/)
    })

    it('should not throw an error if username is missing in single user mode', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const accountManager = AccountManager.from({ host, multiuser: false })

      const request = new PasswordResetEmailRequest({ accountManager })

      expect(() => request.validate()).to.not.throw()
    })
  })

  describe('handlePost()', () => {
    it('should handle the post request', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(true)

      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const options = { accountManager, username, returnToUrl, response }
      const request = new PasswordResetEmailRequest(options)

      sinon.spy(request, 'error')

      return PasswordResetEmailRequest.handlePost(request)
        .then(() => {
          expect(accountManager.loadAccountRecoveryEmail).to.have.been.called()
          expect(accountManager.sendPasswordResetEmail).to.have.been.called()
          expect(response.render).to.have.been.calledWith('auth/reset-link-sent')
          expect(request.error).to.not.have.been.called()
        })
    })

    it('should hande a reset request with no username without privacy leakage', () => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const accountManager = AccountManager.from({ host, multiuser: true, store })
      accountManager.loadAccountRecoveryEmail = sinon.stub().resolves('alice@example.com')
      accountManager.sendPasswordResetEmail = sinon.stub().resolves()
      accountManager.accountExists = sinon.stub().resolves(false)

      const returnToUrl = 'https://example.com/resource'
      const username = 'alice'
      const response = HttpMocks.createResponse()
      response.render = sinon.stub()

      const options = { accountManager, username, returnToUrl, response }
      const request = new PasswordResetEmailRequest(options)

      sinon.spy(request, 'error')
      sinon.spy(request, 'validate')
      sinon.spy(request, 'loadUser')

      return PasswordResetEmailRequest.handlePost(request)
        .then(() => {
          expect(request.validate).to.have.been.called()
          expect(request.loadUser).to.have.been.called()
          expect(request.loadUser).to.throw()
        }).catch(() => {
          expect(request.error).to.have.been.called()
          expect(response.render).to.have.been.calledWith('auth/reset-link-sent')
          expect(accountManager.loadAccountRecoveryEmail).to.not.have.been.called()
          expect(accountManager.sendPasswordResetEmail).to.not.have.been.called()
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
      const request = new PasswordResetEmailRequest(options)

      return request.loadUser()
        .then(account => {
          expect(account.webId).to.equal('https://alice.example.com/profile/card#me')
        })
    })

    it('should throw an error if the user does not exist', done => {
      const host = SolidHost.from({ serverUri: 'https://example.com' })
      const store = { suffixAcl: '.acl' }
      const emailService = sinon.stub().returns(EmailService)
      const accountManager = AccountManager.from({ host, multiuser: true, store, emailService })
      accountManager.accountExists = sinon.stub().resolves(false)
      const username = 'alice'
      const options = { accountManager, username }
      const request = new PasswordResetEmailRequest(options)

      sinon.spy(request, 'resetLinkMessage')
      sinon.spy(accountManager, 'userAccountFrom')
      sinon.spy(accountManager, 'verifyEmailDependencies')

      request.loadUser()
        .then(() => {
          expect(accountManager.userAccountFrom).to.have.been.called()
          expect(accountManager.verifyEmailDependencies).to.have.been.called()
          expect(accountManager.verifyEmailDependencies).to.throw()
          done()
        })
        .catch(() => {
          expect(request.resetLinkMessage).to.have.been.called()
          done()
        })
    })
  })
})