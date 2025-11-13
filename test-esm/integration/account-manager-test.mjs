import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import chai from 'chai'
const expect = chai.expect
chai.should()

import LDP from '../../lib/ldp.js'
import SolidHost from '../../lib/models/solid-host.js'
import AccountManager from '../../lib/models/account-manager.js'
import ResourceMapper from '../../lib/resource-mapper.js'

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const testAccountsDir = path.join(__dirname, '../../test/resources/accounts/')
const accountTemplatePath = path.join(__dirname, '../../default-templates/new-account/')

let host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

afterEach(() => {
  fs.removeSync(path.join(__dirname, '../../test/resources/accounts/alice.example.com'))
})

// FIXME #1502
describe('AccountManager', () => {
  // after(() => {
  //   fs.removeSync(path.join(__dirname, '../resources/accounts/alice.localhost'))
  // })

  describe('accountExists()', () => {
    const testHost = SolidHost.from({ serverUri: 'https://localhost' })

    describe('in multi user mode', () => {
      const multiuser = true
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: path.join(__dirname, '../../test/resources/accounts/'),
        includeHost: multiuser
      })
      const store = new LDP({ multiuser, resourceMapper })
      const options = { multiuser, store, host: testHost }
      const accountManager = AccountManager.from(options)

      it('resolves to true if a directory for the account exists in root', () => {
        // Note: test/resources/accounts/tim.localhost/ exists in this repo
        return accountManager.accountExists('tim')
          .then(exists => {
            console.log('DEBUG tim exists:', exists, typeof exists)
            expect(exists).to.not.be.false
          })
      })

      it('resolves to false if a directory for the account does not exist', () => {
        // Note: test/resources/accounts/alice.localhost/ does NOT exist
        return accountManager.accountExists('alice')
          .then(exists => {
            console.log('DEBUG alice exists:', exists, typeof exists)
            expect(exists).to.not.be.false
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
        const options = { multiuser, store, host: testHost }
        const accountManager = AccountManager.from(options)

        return accountManager.accountExists()
          .then(exists => {
            expect(exists).to.not.be.false
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
        const options = { multiuser, store, host: testHost }
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
          expect(found).to.not.be.false
        })
        .then(() => {
          const profile = fs.readFileSync(path.join(accountDir, '/profile/card$.ttl'), 'utf8')
          expect(profile).to.include('"Alice Q."')
          expect(profile).to.include('solid:oidcIssuer')
          expect(profile).to.include('<https://example.com>')

          const rootAcl = fs.readFileSync(path.join(accountDir, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('</profile/card#me>')
        })
    })
  })
})