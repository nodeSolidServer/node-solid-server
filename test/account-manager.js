'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const SolidHost = require('../lib/models/solid-host')
const AccountManager = require('../lib/models/account-manager')
const { CreateAccountRequest } = require('../lib/models/create-account-request')

describe('AccountManager', () => {
  describe('fromConfig()', () => {
    it('should init with passed in options')
  })

  describe('buildWebIdForAccount()', () => {
    it('should compose a web id uri for an account in multi user mode', () => {
      let options = {
        multiUser: true,
        host: SolidHost.fromConfig({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.fromConfig(options)
      let webId = mgr.buildWebIdForAccount('alice')
      expect(webId).to.equal('https://alice.localhost/profile/card#me')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      let options = {
        multiUser: false,
        host: SolidHost.fromConfig({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.fromConfig(options)
      let webId = mgr.buildWebIdForAccount('alice')
      expect(webId).to.equal('https://localhost/profile/card#me')
    })
  })

  describe('createAccount()', () => {
    let host = SolidHost.fromConfig({ serverUri: 'https://localhost' })
    let accountManager = AccountManager.fromConfig({ host, authMethod: 'tls' })
    let req = { body: {} }
    let res = {}
    let next = () => {}

    it('should create and invoke a CreateAccountRequest', () => {
      let createAccount = sinon.spy(CreateAccountRequest.prototype, 'createAccount')

      accountManager.createAccount(req, res, next)
      expect(createAccount).to.have.been.called
      createAccount.restore()
    })

    it('should call sendWelcomeEmail()', (done) => {
      let sendWelcomeEmail = sinon.spy(accountManager, 'sendWelcomeEmail')

      accountManager.createAccount(req, res, () => {
        expect(sendWelcomeEmail).to.have.been.called
        sendWelcomeEmail.restore()
        done()
      })
    })
  })
})
