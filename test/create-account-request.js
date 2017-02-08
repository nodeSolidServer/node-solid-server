'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const LDP = require('../lib/ldp')
const AccountManager = require('../lib/models/account-manager')
const SolidHost = require('../lib/models/solid-host')
const { CreateAccountRequest } = require('../lib/requests/create-account-request')

var host, store, accountManager
var aliceData, userAccount
var req, session, res

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
  store = new LDP()
  accountManager = AccountManager.from({
    host,
    store,
    authMethod: 'tls',
    multiUser: true
  })

  aliceData = {
    username: 'alice',
    spkac: '123'
  }
  userAccount = accountManager.userAccountFrom(aliceData)

  session = {}
  req = {
    body: aliceData,
    session
  }
  res = HttpMocks.createResponse()
})

describe('CreateAccountRequest', () => {
  describe('constructor()', () => {
    it('should create an instance with the given config', () => {
      let options = { accountManager, userAccount, session, response: res }
      let request = new CreateAccountRequest(options)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.userAccount).to.equal(userAccount)
      expect(request.session).to.equal(session)
      expect(request.response).to.equal(res)
    })
  })

  describe('fromParams()', () => {
    it('should create subclass depending on authMethod', () => {
      let accountManager = AccountManager.from({ host, authMethod: 'tls' })
      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      expect(request).to.respondTo('generateTlsCertificate')
    })
  })

  describe('createAccount()', () => {
    it('should return a 400 error if account already exists', done => {
      let accountManager = AccountManager.from({ host })
      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      accountManager.accountExists = sinon.stub().returns(Promise.resolve(true))

      request.createAccount()
        .catch(err => {
          expect(err.status).to.equal(400)
          done()
        })
    })

    it('should return a UserAccount instance', () => {
      let multiUser = true
      let accountManager = AccountManager.from({ host, store, multiUser })
      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))
      accountManager.createAccountFor = sinon.stub().returns(Promise.resolve())

      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.sendResponse = sinon.stub()
      request.generateCredentials = (userAccount) => {
        return Promise.resolve(userAccount)
      }

      return request.createAccount()
        .then(newUser => {
          expect(newUser.username).to.equal('alice')
          expect(newUser.webId).to.equal('https://alice.example.com/profile/card#me')
        })
    })

    it('should call generateCredentials()', () => {
      let accountManager = AccountManager.from({ host, store })
      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))
      accountManager.createAccountFor = sinon.stub().returns(Promise.resolve())

      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.generateCredentials = (userAccount) => {
        return Promise.resolve(userAccount)
      }
      request.sendResponse = sinon.stub()
      let generateCredentials = sinon.spy(request, 'generateCredentials')

      return request.createAccount()
        .then(() => {
          expect(generateCredentials).to.have.been.called
        })
    })

    it('should call createAccountStorage()', () => {
      let accountManager = AccountManager.from({ host, store })
      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))
      accountManager.createAccountFor = sinon.stub().returns(Promise.resolve())

      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.generateCredentials = (userAccount) => {
        return Promise.resolve(userAccount)
      }
      request.sendResponse = sinon.stub()
      let createAccountStorage = sinon.spy(request, 'createAccountStorage')

      return request.createAccount()
        .then(() => {
          expect(createAccountStorage).to.have.been.called
        })
    })

    it('should call initSession()', () => {
      let accountManager = AccountManager.from({ host, store })
      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))
      accountManager.createAccountFor = sinon.stub().returns(Promise.resolve())

      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.generateCredentials = (userAccount) => {
        return Promise.resolve(userAccount)
      }
      request.sendResponse = sinon.stub()
      let initSession = sinon.spy(request, 'initSession')

      return request.createAccount()
        .then(() => {
          expect(initSession).to.have.been.called
        })
    })

    it('should call sendResponse()', () => {
      let accountManager = AccountManager.from({ host, store })
      accountManager.accountExists = sinon.stub().returns(Promise.resolve(false))
      accountManager.createAccountFor = sinon.stub().returns(Promise.resolve())

      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.generateCredentials = (userAccount) => {
        return Promise.resolve(userAccount)
      }
      request.sendResponse = sinon.stub()

      return request.createAccount()
        .then(() => {
          expect(request.sendResponse).to.have.been.called
        })
    })
  })
})

describe('CreateTlsAccountRequest', () => {
  let authMethod = 'tls'

  describe('fromParams()', () => {
    it('should create an instance with the given config', () => {
      let accountManager = AccountManager.from({ host, store, authMethod })
      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      expect(request.accountManager).to.equal(accountManager)
      expect(request.userAccount.username).to.equal('alice')
      expect(request.session).to.equal(session)
      expect(request.response).to.equal(res)
      expect(request.spkac).to.equal(aliceData.spkac)
    })
  })

  describe('generateCredentials()', () => {
    it('should call generateTlsCertificate()', () => {
      let accountManager = AccountManager.from({ host, store, authMethod })
      let request = CreateAccountRequest.fromParams(req, res, accountManager)

      request.generateTlsCertificate = (userAccount) => {
        return Promise.resolve(userAccount)
      }
      let generateTlsCertificate = sinon.spy(request, 'generateTlsCertificate')

      return request.generateCredentials(userAccount)
        .then(() => {
          expect(generateTlsCertificate).to.have.been.calledWith(userAccount)
        })
    })
  })
})
