'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const AccountManager = require('../lib/models/account-manager')
const SolidHost = require('../lib/models/solid-host')
const { CreateAccountRequest } = require('../lib/models/create-account-request')

var host, accountManager
var aliceData, userAccount
var session, response

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
  accountManager = AccountManager.from({
    host,
    authMethod: 'tls',
    multiUser: true
  })

  aliceData = {
    username: 'alice'
  }
  userAccount = accountManager.userAccountFrom(aliceData)

  session = {}
  response = HttpMocks.createResponse()
})

describe('CreateAccountRequest', () => {
  describe('from()', () => {
    it('should create an instance with the given config', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.userAccount).to.equal(userAccount)
      expect(request.session).to.equal(session)
      expect(request.response).to.equal(response)
    })

    it('should create subclass depending on authMethod', () => {
      let accountManager = AccountManager.from({
        host,
        authMethod: 'tls',
        multiUser: true
      })
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      expect(request).to.be.a.CreateTlsAccountRequest
      expect(request.webidTls).to.exist
    })
  })

  describe('createAccount()', () => {
    it('should return a UserAccount instance', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      return request.createAccount()
        .then(newUser => {
          expect(newUser.username).to.equal('alice')
          expect(newUser.webId).to.equal('https://alice.example.com/profile/card#me')
        })
    })

    it('should call generateCredentials()', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      let generateCredentials = sinon.spy(request, 'generateCredentials')

      return request.createAccount()
        .then(() => {
          expect(generateCredentials).to.have.been.called
        })
    })

    it('should call createAccountFolders()', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      let credentials = 'test creds'
      request.generateCredentials = sinon.stub().returns(credentials)
      let createAccountFolders = sinon.spy(request, 'createAccountFolders')

      return request.createAccount()
        .then(() => {
          expect(createAccountFolders).to.have.been.calledWith(credentials)
        })
    })

    it('should call initSession()', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      let initSession = sinon.spy(request, 'initSession')

      return request.createAccount()
        .then(() => {
          expect(initSession).to.have.been.called
        })
    })

    it('should call sendResponse()', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      let sendResponse = sinon.spy(request, 'sendResponse')

      return request.createAccount()
        .then(() => {
          expect(sendResponse).to.have.been.called
        })
    })
  })
})

describe('CreateTlsAccountRequest', () => {
  describe('generateCredentials()', () => {
    it('should call generateTlsCertificate()', () => {
      let config = { accountManager, userAccount, session, response }
      let request = CreateAccountRequest.from(config)

      let generateTlsCertificate = sinon.spy(request, 'generateTlsCertificate')

      return request.generateCredentials(userAccount)
        .then(() => {
          expect(generateTlsCertificate).to.have.been.calledWith(userAccount)
        })
    })
  })
})
