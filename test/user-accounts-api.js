'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const LDP = require('../lib/ldp')
const SolidHost = require('../lib/models/solid-host')
const AccountManager = require('../lib/models/account-manager')
const testAccountsDir = path.join(__dirname, 'resources', 'accounts')

const api = require('../lib/api/accounts/user-accounts')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('api/accounts/user-accounts', () => {
  describe('createAccount()', () => {
    let multiUser = true
    let store = new LDP({ root: testAccountsDir, idp: multiUser })

    it('should call createAccountFor(), and call next() on success', () => {
      let options = { host, store, multiUser, authMethod: 'tls' }
      let accountManager = AccountManager.from(options)

      let createAccountFor = sinon.spy(accountManager, 'createAccountFor')
      let req = {
        body: { username: 'alice' },
        session: {}
      }
      let res = HttpMocks.createResponse()
      let next = () => {}

      let createAccount = api.createAccount(accountManager)

      return createAccount(req, res, next)
        .then(() => {
          expect(createAccountFor).to.have.been.called
        })
    })

    it('should call next(error) if an exception occurs in userAccountFrom()', done => {
      let options = { host, store, multiUser, authMethod: 'tls' }
      let accountManager = AccountManager.from(options)
      let req = {
        body: { username: 'alice' },
        session: {}
      }
      let res = HttpMocks.createResponse()

      accountManager.userAccountFrom = sinon.stub().throws()
      let createAccountFor = sinon.spy(accountManager, 'createAccountFor')

      let createAccount = api.createAccount(accountManager)

      createAccount(req, res, (err) => {
        expect(err.status).to.equal(400)
        expect(createAccountFor).to.not.have.been.called
        done()
      })
    })

    it('should call next(error) if an exception occurs in createAccountFor()', done => {
      let options = { host, store, multiUser, authMethod: 'tls' }
      let accountManager = AccountManager.from(options)
      let req = {
        body: { username: 'alice' },
        session: {}
      }
      let res = HttpMocks.createResponse()

      accountManager.createAccountFor = sinon.stub().returns(Promise.reject(new Error()))
      let userAccountFrom = sinon.spy(accountManager, 'userAccountFrom')

      let createAccount = api.createAccount(accountManager)

      createAccount(req, res, (err) => {
        expect(err.status).to.equal(400)
        expect(userAccountFrom).to.have.been.called
        done()
      })
    })
  })
})
