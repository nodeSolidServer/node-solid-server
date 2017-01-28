'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const AccountManager = require('../lib/models/account-manager')
const SolidHost = require('../lib/models/solid-host')
const {
  CreateAccountRequest,
  CreateTlsAccountRequest
} = require('../lib/models/create-account-request')

describe('CreateAccountRequest', () => {
  describe('configFromParams()', () => {
    let host = SolidHost.fromConfig({ serverUri: 'https://example.com' })
    let accountManager = AccountManager.fromConfig({
      host,
      authMethod: 'tls',
      multiUser: true
    })
    let req = {
      body: {
        username: 'alice',
        email: 'alice@alice.com',
        name: 'Alice',
        spkac: '12345'
      }
    }
    let res = {}

    it('should return an assembled config object from request params', () => {
      let config = CreateAccountRequest.configFromParams(accountManager, req, res)

      expect(config.accountManager).to.equal(accountManager)
      expect(config.req).to.equal(req)
      expect(config.res).to.equal(res)

      expect(config.authMethod).to.exist
      expect(config.authMethod).to.equal(accountManager.authMethod)

      expect(config.username).to.equal(req.body.username)
      expect(config.email).to.equal(req.body.email)
      expect(config.name).to.equal(req.body.name)
      expect(config.spkac).to.equal(req.body.spkac)

      expect(config.webId).to.equal('https://alice.example.com/profile/card#me')

      // let firstUser = res.locals.firstUser
      // let emailService = req.app.locals.email
    })
  })

  describe('fromParams()', () => {
    let host = SolidHost.fromConfig({ serverUri: 'https://localhost' })
    let accountManager = AccountManager.fromConfig({ host, authMethod: 'tls' })
    let req = {
      body: { username: 'alice' }
    }
    let res = {}
    // let assembledConfig = CreateAccountRequest.configFromParams(accountManager, req, res)

    it('should assemble options and call fromConfig()', () => {
      let fromConfig = sinon.spy(CreateAccountRequest, 'fromConfig')
      let configFromParams = sinon.spy(CreateAccountRequest, 'configFromParams')

      CreateAccountRequest.fromParams(accountManager, req, res)

      expect(fromConfig).to.have.been.called
      expect(configFromParams).to.have.been.called

      CreateAccountRequest.fromConfig.restore()
      CreateAccountRequest.configFromParams.restore()
    })
  })

  describe('createAccount()', () => {
    let host = SolidHost.fromConfig({ serverUri: 'https://localhost' })
    let accountManager = AccountManager.fromConfig({ host, authMethod: 'tls' })
    let req = { body: {} }
    let res = {}

    it('should call generateCredentials()', () => {
      let request = CreateAccountRequest.fromParams(accountManager, req, res)

      let generateCredentials = sinon.spy(request, 'generateCredentials')

      return request.createAccount()
        .then(() => {
          expect(generateCredentials).to.have.been.called
        })
    })

    it('should call createAccountFolders()', () => {
      let request = CreateAccountRequest.fromParams(accountManager, req, res)

      let credentials = 'test creds'
      request.generateCredentials = sinon.stub().returns(credentials)
      let createAccountFolders = sinon.spy(request, 'createAccountFolders')

      return request.createAccount()
        .then(() => {
          expect(createAccountFolders).to.have.been.calledWith(credentials)
        })
    })

    it('should call initSession()', () => {
      let request = CreateAccountRequest.fromParams(accountManager, req, res)

      let initSession = sinon.spy(request, 'initSession')

      return request.createAccount()
        .then(() => {
          expect(initSession).to.have.been.called
        })
    })

    it('should call sendResponse()', () => {
      let request = CreateAccountRequest.fromParams(accountManager, req, res)

      let sendResponse = sinon.spy(request, 'sendResponse')

      return request.createAccount()
        .then(() => {
          expect(sendResponse).to.have.been.called
        })
    })
  })
})

describe('CreateTlsAccountRequest', () => {
  describe('fromConfig()', () => {
    it('should create subclass depending on authMethod', () => {
      let config = { authMethod: 'tls' }
      let request = CreateAccountRequest.fromConfig(config)

      expect(request).to.be.a.CreateTlsAccountRequest
      expect(request.webidTls).to.exist
    })
  })

  describe('createAccount()', () => {
    let host = SolidHost.fromConfig({ serverUri: 'https://localhost' })
    let accountManager = AccountManager.fromConfig({ host, authMethod: 'tls' })
    let req = { body: {} }
    let res = {}

    it('should call generateTlsCertificate()', () => {
      let request = CreateAccountRequest.fromParams(accountManager, req, res)

      let generateTlsCertificate = sinon.spy(request, 'generateTlsCertificate')

      return request.createAccount()
        .then(() => {
          expect(generateTlsCertificate).to.have.been.called
        })
    })
  })
})
