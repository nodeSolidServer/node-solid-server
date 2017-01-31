'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
// const HttpMocks = require('node-mocks-http')

const LDP = require('../lib/ldp')
const SolidHost = require('../lib/models/solid-host')
const AccountManager = require('../lib/models/account-manager')

const testAccountsDir = path.join(__dirname, 'resources', 'accounts')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AccountManager', () => {
  describe('from()', () => {
    it('should init with passed in options', () => {
      let config = {
        host,
        authMethod: 'tls',
        multiUser: true,
        store: {},
        emailService: {}
      }

      let mgr = AccountManager.from(config)
      expect(mgr.host).to.equal(config.host)
      expect(mgr.authMethod).to.equal(config.authMethod)
      expect(mgr.multiUser).to.equal(config.multiUser)
      expect(mgr.store).to.equal(config.store)
      expect(mgr.emailService).to.equal(config.emailService)
    })
  })

  describe('accountUriFor', () => {
    it('should compose account uri for an account in multi user mode', () => {
      let options = {
        multiUser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)

      let webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://alice.localhost')
    })

    it('should compose account uri for an account in single user mode', () => {
      let options = {
        multiUser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)

      let webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://localhost')
    })
  })

  describe('accountWebIdFor()', () => {
    it('should compose a web id uri for an account in multi user mode', () => {
      let options = {
        multiUser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://alice.localhost/profile/card#me')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      let options = {
        multiUser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://localhost/profile/card#me')
    })
  })

  describe('accountExists()', () => {
    let host = SolidHost.from({ serverUri: 'https://localhost' })

    describe('in multi user mode', () => {
      let multiUser = true
      let store = new LDP({ root: testAccountsDir, idp: multiUser })
      let options = { multiUser, store, host }
      let accountManager = AccountManager.from(options)

      it('resolves to true if a directory for the account exists in root', () => {
        // Note: test/resources/accounts/tim.localhost/ exists in this repo
        return accountManager.accountExists('tim')
          .then(exists => {
            expect(exists).to.be.true
          })
      })

      it('resolves to false if a directory for the account does not exist', () => {
        // Note: test/resources/accounts/alice.localhost/ does NOT exist
        return accountManager.accountExists('alice')
          .then(exists => {
            expect(exists).to.be.false
          })
      })
    })

    describe('in single user mode', () => {
      let multiUser = false

      it('resolves to true if root .acl exists in root storage', () => {
        let store = new LDP({
          root: path.join(testAccountsDir, 'tim.localhost'),
          idp: multiUser
        })
        let options = { multiUser, store, host }
        let accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.true
          })
      })

      it('resolves to false if root .acl does not exist in root storage', () => {
        let store = new LDP({
          root: testAccountsDir,
          idp: multiUser
        })
        let options = { multiUser, store, host }
        let accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.false
          })
      })
    })
  })

  describe('createAccountFor()', () => {
    describe('in multi user mode', () => {
      let multiUser = true
      let store = new LDP({ root: testAccountsDir, idp: multiUser })

      it('should return a 400 error if account already exists for username', done => {
        let options = { host, store, multiUser, authMethod: 'tls' }
        let accountManager = AccountManager.from(options)
        let newAccount = accountManager.userAccountFrom({ username: 'alice' })

        accountManager.accountExists = sinon.stub().returns(Promise.resolve(true))

        accountManager.createAccountFor(newAccount)
          .catch(err => {
            expect(err.status).to.equal(400)
            done()
          })
      })
    })

    describe('in single user mode', () => {
      let multiUser = false
      let store = new LDP({ root: testAccountsDir, idp: multiUser })

      it('should return a 400 error if account already exists for username', done => {
        let options = { host, store, multiUser, authMethod: 'tls' }
        let accountManager = AccountManager.from(options)
        let newAccount = accountManager.userAccountFrom({ username: 'alice' })

        accountManager.accountExists = sinon.stub().returns(Promise.resolve(true))

        accountManager.createAccountFor(newAccount)
          .catch(err => {
            expect(err.status).to.equal(400)
            done()
          })
      })
    })
  })
})
