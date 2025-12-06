import { describe, it, beforeEach, afterEach } from 'mocha'
import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import dirtyChai from 'dirty-chai'

import { PasswordAuthenticator } from '../../lib/models/authenticator.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'

const { expect } = chai
chai.use(sinonChai)
chai.use(dirtyChai)
chai.should()

const mockUserStore = {
  findUser: () => { return Promise.resolve(true) },
  matchPassword: (user, password) => { return Promise.resolve(user) }
}

const host = SolidHost.from({ serverUri: 'https://localhost:8443' })
const accountManager = AccountManager.from({ host })

describe('PasswordAuthenticator', () => {
  describe('fromParams()', () => {
    const req = {
      body: { username: 'alice', password: '12345' }
    }
    const options = { userStore: mockUserStore, accountManager }

    it('should return a PasswordAuthenticator instance', () => {
      const pwAuth = PasswordAuthenticator.fromParams(req, options)

      expect(pwAuth.userStore).to.equal(mockUserStore)
      expect(pwAuth.accountManager).to.equal(accountManager)
      expect(pwAuth.username).to.equal('alice')
      expect(pwAuth.password).to.equal('12345')
    })

    it('should init with undefined username and password if no body is provided', () => {
      const req = {}
      const pwAuth = PasswordAuthenticator.fromParams(req, options)

      expect(pwAuth.username).to.be.undefined()
      expect(pwAuth.password).to.be.undefined()
    })
  })

  describe('findValidUser()', () => {
    let pwAuth, sandbox

    beforeEach(() => {
      sandbox = sinon.createSandbox()
      const req = {
        body: { username: 'alice', password: '12345' }
      }
      const options = { userStore: mockUserStore, accountManager }
      pwAuth = PasswordAuthenticator.fromParams(req, options)
    })

    afterEach(() => {
      sandbox.restore()
    })

    it('should resolve with user if credentials are valid', () => {
      const findUserStub = sandbox.stub(mockUserStore, 'findUser')
        .resolves({ username: 'alice' })
      const matchPasswordStub = sandbox.stub(mockUserStore, 'matchPassword')
        .resolves({ username: 'alice' })

      return pwAuth.findValidUser()
        .then(user => {
          expect(user.username).to.equal('alice')
        })
    })

    it('should reject if user is not found', () => {
      const findUserStub = sandbox.stub(mockUserStore, 'findUser')
        .resolves(null)

      return pwAuth.findValidUser()
        .catch(error => {
          expect(error.message).to.include('Invalid username/password combination.')
        })
    })

    it('should reject if password does not match', () => {
      const findUserStub = sandbox.stub(mockUserStore, 'findUser')
        .resolves({ username: 'alice' })
      const matchPasswordStub = sandbox.stub(mockUserStore, 'matchPassword')
        .resolves(null)

      return pwAuth.findValidUser()
        .catch(error => {
          expect(error.message).to.include('Invalid username/password combination.')
        })
    })

    it('should reject with error if userStore throws', () => {
      const findUserStub = sandbox.stub(mockUserStore, 'findUser')
        .rejects(new Error('Database error'))

      return pwAuth.findValidUser()
        .catch(error => {
          expect(error.message).to.equal('Database error')
        })
    })
  })

  describe('validate()', () => {
    it('should throw a 400 error if no username was provided', () => {
      const options = { username: null, password: '12345' }
      const pwAuth = new PasswordAuthenticator(options)

      expect(() => pwAuth.validate()).to.throw('Username required')
    })

    it('should throw a 400 error if no password was provided', () => {
      const options = { username: 'alice', password: null }
      const pwAuth = new PasswordAuthenticator(options)

      expect(() => pwAuth.validate()).to.throw('Password required')
    })
  })
})
