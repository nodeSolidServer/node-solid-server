'use strict'
/* eslint-disable no-unused-expressions */

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
chai.should()

const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const ResourceMapper = require('../../lib/resource-mapper')

const testAccountsDir = path.join(__dirname, '../resources/accounts')
const accountTemplatePath = path.join(__dirname, '../../default-templates/new-account')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

afterEach(() => {
  fs.removeSync(path.join(__dirname, '../resources/accounts/alice.example.com'))
})

describe('AccountManager', () => {
  describe('accountExists()', () => {
    const host = SolidHost.from({ serverUri: 'https://localhost' })

    describe('in multi user mode', () => {
      const multiuser = true
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: process.cwd(),
        includeHost: multiuser
      })
      const store = new LDP({ multiuser, resourceMapper })
      const options = { multiuser, store, host }
      const accountManager = AccountManager.from(options)

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
      const multiuser = false

      it('resolves to true if root .acl exists in root storage', () => {
        const resourceMapper = new ResourceMapper({
          rootUrl: 'https://localhost:8443/',
          includeHost: multiuser,
          rootPath: path.join(testAccountsDir, 'tim.localhost')
        })
        const store = new LDP({
          multiuser,
          resourceMapper
        })
        const options = { multiuser, store, host }
        const accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.true
          })
      })

      it('resolves to false if root .acl does not exist in root storage', () => {
        const resourceMapper = new ResourceMapper({
          rootUrl: 'https://localhost:8443/',
          includeHost: multiuser,
          rootPath: testAccountsDir
        })
        const store = new LDP({
          multiuser,
          resourceMapper
        })
        const options = { multiuser, store, host }
        const accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.be.false
          })
      })
    })
  })

  describe('createAccountFor()', () => {
    it('should create an account directory', () => {
      const multiuser = true
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      const store = new LDP({ multiuser, resourceMapper })
      const options = { host, multiuser, store, accountTemplatePath }
      const accountManager = AccountManager.from(options)

      const userData = {
        username: 'alice',
        email: 'alice@example.com',
        name: 'Alice Q.'
      }
      const userAccount = accountManager.userAccountFrom(userData)

      const accountDir = accountManager.accountDirFor('alice')

      return accountManager.createAccountFor(userAccount)
        .then(() => {
          return accountManager.accountExists('alice')
        })
        .then(found => {
          expect(found).to.be.true
        })
        .then(() => {
          const profile = fs.readFileSync(path.join(accountDir, '/profile/card$.ttl'), 'utf8')
          expect(profile).to.include('"Alice Q."')

          const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('<https://alice.example.com/profile/card#me>')
        })
    })
  })
})
