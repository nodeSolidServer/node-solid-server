'use strict'
/* eslint-disable no-unused-expressions */

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.use(require('dirty-chai'))
chai.should()

const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)
const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const UserAccount = require('../../lib/models/user-account')
const TokenService = require('../../lib/services/token-service')
const WebIdTlsCertificate = require('../../lib/models/webid-tls-certificate')
const ResourceMapper = require('../../lib/resource-mapper')

const testAccountsDir = path.join(__dirname, '../resources/accounts')

let host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AccountManager', () => {
  describe('from()', () => {
    it('should init with passed in options', () => {
      const config = {
        host,
        authMethod: 'oidc',
        multiuser: true,
        store: {},
        emailService: {},
        tokenService: {}
      }

      const mgr = AccountManager.from(config)
      expect(mgr.host).to.equal(config.host)
      expect(mgr.authMethod).to.equal(config.authMethod)
      expect(mgr.multiuser).to.equal(config.multiuser)
      expect(mgr.store).to.equal(config.store)
      expect(mgr.emailService).to.equal(config.emailService)
      expect(mgr.tokenService).to.equal(config.tokenService)
    })

    it('should error if no host param is passed in', () => {
      expect(() => { AccountManager.from() })
        .to.throw(/AccountManager requires a host instance/)
    })
  })

  describe('accountUriFor', () => {
    it('should compose account uri for an account in multi user mode', () => {
      const options = {
        multiuser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      const mgr = AccountManager.from(options)

      const webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://alice.localhost')
    })

    it('should compose account uri for an account in single user mode', () => {
      const options = {
        multiuser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      const mgr = AccountManager.from(options)

      const webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://localhost')
    })
  })

  describe('accountWebIdFor()', () => {
    it('should compose a web id uri for an account in multi user mode', () => {
      const options = {
        multiuser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      const mgr = AccountManager.from(options)
      const webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://alice.localhost/profile/card#me')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      const options = {
        multiuser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      const mgr = AccountManager.from(options)
      const webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://localhost/profile/card#me')
    })
  })

  describe('accountDirFor()', () => {
    it('should match the solid root dir config, in single user mode', () => {
      const multiuser = false
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      const store = new LDP({ multiuser, resourceMapper })
      const options = { multiuser, store, host }
      const accountManager = AccountManager.from(options)

      const accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(store.resourceMapper._rootPath)
    })

    it('should compose the account dir in multi user mode', () => {
      const multiuser = true
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      const store = new LDP({ multiuser, resourceMapper })
      const host = SolidHost.from({ serverUri: 'https://localhost' })
      const options = { multiuser, store, host }
      const accountManager = AccountManager.from(options)

      const accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(testAccountsDir + '/alice.localhost')
    })
  })

  describe('userAccountFrom()', () => {
    describe('in multi user mode', () => {
      const multiuser = true
      let options, accountManager

      beforeEach(() => {
        options = { host, multiuser }
        accountManager = AccountManager.from(options)
      })

      it('should throw an error if no username is passed', () => {
        expect(() => {
          accountManager.userAccountFrom({})
        }).to.throw(/Username or web id is required/)
      })

      it('should init webId from param if no username is passed', () => {
        const userData = { webId: 'https://example.com' }
        const newAccount = accountManager.userAccountFrom(userData)
        expect(newAccount.webId).to.equal(userData.webId)
      })

      it('should derive the local account id from username, for external webid', () => {
        const userData = {
          externalWebId: 'https://alice.external.com/profile#me',
          username: 'user1'
        }

        const newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('user1')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.localAccountId).to.equal('user1.example.com/profile/card#me')
      })

      it('should use the external web id as username if no username given', () => {
        const userData = {
          externalWebId: 'https://alice.external.com/profile#me'
        }

        const newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
      })
    })

    describe('in single user mode', () => {
      const multiuser = false
      let options, accountManager

      beforeEach(() => {
        options = { host, multiuser }
        accountManager = AccountManager.from(options)
      })

      it('should not throw an error if no username is passed', () => {
        expect(() => {
          accountManager.userAccountFrom({})
        }).to.not.throw(Error)
      })
    })
  })

  describe('addCertKeyToProfile()', () => {
    let accountManager, certificate, userAccount, profileGraph

    beforeEach(() => {
      const options = { host }
      accountManager = AccountManager.from(options)
      userAccount = accountManager.userAccountFrom({ username: 'alice' })
      certificate = WebIdTlsCertificate.fromSpkacPost('1234', userAccount, host)
      profileGraph = {}
    })

    it('should fetch the profile graph', () => {
      accountManager.getProfileGraphFor = sinon.stub().returns(Promise.resolve())
      accountManager.addCertKeyToGraph = sinon.stub()
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.getProfileGraphFor).to
            .have.been.calledWith(userAccount)
        })
    })

    it('should add the cert key to the account graph', () => {
      accountManager.getProfileGraphFor = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.addCertKeyToGraph = sinon.stub()
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.addCertKeyToGraph).to
            .have.been.calledWith(certificate, profileGraph)
          expect(accountManager.addCertKeyToGraph).to
            .have.been.calledAfter(accountManager.getProfileGraphFor)
        })
    })

    it('should save the modified graph to the profile doc', () => {
      accountManager.getProfileGraphFor = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.addCertKeyToGraph = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.saveProfileGraph).to
            .have.been.calledWith(profileGraph, userAccount)
          expect(accountManager.saveProfileGraph).to
            .have.been.calledAfter(accountManager.addCertKeyToGraph)
        })
    })
  })

  describe('getProfileGraphFor()', () => {
    it('should throw an error if webId is missing', (done) => {
      const emptyUserData = {}
      const userAccount = UserAccount.from(emptyUserData)
      const options = { host, multiuser: true }
      const accountManager = AccountManager.from(options)

      accountManager.getProfileGraphFor(userAccount)
        .catch(error => {
          expect(error.message).to
            .equal('Cannot fetch profile graph, missing WebId URI')
          done()
        })
    })

    it('should fetch the profile graph via LDP store', () => {
      const store = {
        getGraph: sinon.stub().returns(Promise.resolve())
      }
      const webId = 'https://alice.example.com/#me'
      const profileHostUri = 'https://alice.example.com/'

      const userData = { webId }
      const userAccount = UserAccount.from(userData)
      const options = { host, multiuser: true, store }
      const accountManager = AccountManager.from(options)

      expect(userAccount.webId).to.equal(webId)

      return accountManager.getProfileGraphFor(userAccount)
        .then(() => {
          expect(store.getGraph).to.have.been.calledWith(profileHostUri)
        })
    })
  })

  describe('saveProfileGraph()', () => {
    it('should save the profile graph via the LDP store', () => {
      const store = {
        putGraph: sinon.stub().returns(Promise.resolve())
      }
      const webId = 'https://alice.example.com/#me'
      const profileHostUri = 'https://alice.example.com/'

      const userData = { webId }
      const userAccount = UserAccount.from(userData)
      const options = { host, multiuser: true, store }
      const accountManager = AccountManager.from(options)
      const profileGraph = rdf.graph()

      return accountManager.saveProfileGraph(profileGraph, userAccount)
        .then(() => {
          expect(store.putGraph).to.have.been.calledWith(profileGraph, profileHostUri)
        })
    })
  })

  describe('rootAclFor()', () => {
    it('should return the server root .acl in single user mode', () => {
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: process.cwd(),
        includeHost: false
      })
      const store = new LDP({ suffixAcl: '.acl', multiuser: false, resourceMapper })
      const options = { host, multiuser: false, store }
      const accountManager = AccountManager.from(options)

      const userAccount = UserAccount.from({ username: 'alice' })

      const rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://example.com/.acl')
    })

    it('should return the profile root .acl in multi user mode', () => {
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: process.cwd(),
        includeHost: true
      })
      const store = new LDP({ suffixAcl: '.acl', multiuser: true, resourceMapper })
      const options = { host, multiuser: true, store }
      const accountManager = AccountManager.from(options)

      const userAccount = UserAccount.from({ username: 'alice' })

      const rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://alice.example.com/.acl')
    })
  })

  describe('loadAccountRecoveryEmail()', () => {
    it('parses and returns the agent mailto from the root acl', () => {
      const userAccount = UserAccount.from({ username: 'alice' })

      const rootAclGraph = rdf.graph()
      rootAclGraph.add(
        rdf.namedNode('https://alice.example.com/.acl#owner'),
        ns.acl('agent'),
        rdf.namedNode('mailto:alice@example.com')
      )

      const store = {
        suffixAcl: '.acl',
        getGraph: sinon.stub().resolves(rootAclGraph)
      }

      const options = { host, multiuser: true, store }
      const accountManager = AccountManager.from(options)

      return accountManager.loadAccountRecoveryEmail(userAccount)
        .then(recoveryEmail => {
          expect(recoveryEmail).to.equal('alice@example.com')
        })
    })

    it('should return undefined when agent mailto is missing', () => {
      const userAccount = UserAccount.from({ username: 'alice' })

      const emptyGraph = rdf.graph()

      const store = {
        suffixAcl: '.acl',
        getGraph: sinon.stub().resolves(emptyGraph)
      }

      const options = { host, multiuser: true, store }
      const accountManager = AccountManager.from(options)

      return accountManager.loadAccountRecoveryEmail(userAccount)
        .then(recoveryEmail => {
          expect(recoveryEmail).to.be.undefined()
        })
    })
  })

  describe('passwordResetUrl()', () => {
    it('should return a token reset validation url', () => {
      const tokenService = new TokenService()
      const options = { host, multiuser: true, tokenService }

      const accountManager = AccountManager.from(options)

      const returnToUrl = 'https://example.com/resource'
      const token = '123'

      const resetUrl = accountManager.passwordResetUrl(token, returnToUrl)

      const expectedUri = 'https://example.com/account/password/change?' +
        'token=123&returnToUrl=' + returnToUrl

      expect(resetUrl).to.equal(expectedUri)
    })
  })

  describe('generateDeleteToken()', () => {
    it('should generate and store an expiring delete token', () => {
      const tokenService = new TokenService()
      const options = { host, tokenService }

      const accountManager = AccountManager.from(options)

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }

      const token = accountManager.generateDeleteToken(userAccount)

      const tokenValue = accountManager.tokenService.verify('delete-account', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('generateResetToken()', () => {
    it('should generate and store an expiring reset token', () => {
      const tokenService = new TokenService()
      const options = { host, tokenService }

      const accountManager = AccountManager.from(options)

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }

      const token = accountManager.generateResetToken(userAccount)

      const tokenValue = accountManager.tokenService.verify('reset-password', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('sendPasswordResetEmail()', () => {
    it('should compose and send a password reset email', () => {
      const resetToken = '1234'
      const tokenService = {
        generate: sinon.stub().returns(resetToken)
      }

      const emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const returnToUrl = 'https://example.com/resource'

      const options = { host, tokenService, emailService }
      const accountManager = AccountManager.from(options)

      accountManager.passwordResetUrl = sinon.stub().returns('reset url')

      const expectedEmailData = {
        to: 'alice@example.com',
        webId: aliceWebId,
        resetUrl: 'reset url'
      }

      return accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .then(() => {
          expect(accountManager.passwordResetUrl)
            .to.have.been.calledWith(resetToken, returnToUrl)
          expect(emailService.sendWithTemplate)
            .to.have.been.calledWith('reset-password', expectedEmailData)
        })
    })

    it('should reject if no email service is set up', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const returnToUrl = 'https://example.com/resource'
      const options = { host }
      const accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }
      const returnToUrl = 'https://example.com/resource'
      const emailService = {}
      const options = { host, emailService }

      const accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })

  describe('sendDeleteAccountEmail()', () => {
    it('should compose and send a delete account email', () => {
      const deleteToken = '1234'
      const tokenService = {
        generate: sinon.stub().returns(deleteToken)
      }

      const emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }

      const options = { host, tokenService, emailService }
      const accountManager = AccountManager.from(options)

      accountManager.getAccountDeleteUrl = sinon.stub().returns('delete account url')

      const expectedEmailData = {
        to: 'alice@example.com',
        webId: aliceWebId,
        deleteUrl: 'delete account url'
      }

      return accountManager.sendDeleteAccountEmail(userAccount)
        .then(() => {
          expect(accountManager.getAccountDeleteUrl)
            .to.have.been.calledWith(deleteToken)
          expect(emailService.sendWithTemplate)
            .to.have.been.calledWith('delete-account', expectedEmailData)
        })
    })

    it('should reject if no email service is set up', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      const options = { host }
      const accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      const aliceWebId = 'https://alice.example.com/#me'
      const userAccount = {
        webId: aliceWebId
      }
      const emailService = {}
      const options = { host, emailService }

      const accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })
})
