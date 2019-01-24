'use strict'

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

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AccountManager', () => {
  describe('from()', () => {
    it('should init with passed in options', () => {
      let config = {
        host,
        authMethod: 'oidc',
        multiuser: true,
        store: {},
        emailService: {},
        tokenService: {}
      }

      let mgr = AccountManager.from(config)
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
      let options = {
        multiuser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)

      let webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://alice.localhost')
    })

    it('should compose account uri for an account in single user mode', () => {
      let options = {
        multiuser: false,
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
        multiuser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://alice.localhost/profile/card#me')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      let options = {
        multiuser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://localhost/profile/card#me')
    })
  })

  describe('accountDirFor()', () => {
    it('should match the solid root dir config, in single user mode', () => {
      let multiuser = false
      let resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      let store = new LDP({ multiuser, resourceMapper })
      let options = { multiuser, store, host }
      let accountManager = AccountManager.from(options)

      let accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(store.resourceMapper._rootPath)
    })

    it('should compose the account dir in multi user mode', () => {
      let multiuser = true
      let resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      let store = new LDP({ multiuser, resourceMapper })
      let host = SolidHost.from({ serverUri: 'https://localhost' })
      let options = { multiuser, store, host }
      let accountManager = AccountManager.from(options)

      let accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(testAccountsDir + '/alice.localhost')
    })
  })

  describe('userAccountFrom()', () => {
    describe('in multi user mode', () => {
      let multiuser = true
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
        let userData = { webId: 'https://example.com' }
        let newAccount = accountManager.userAccountFrom(userData)
        expect(newAccount.webId).to.equal(userData.webId)
      })

      it('should derive the local account id from username, for external webid', () => {
        let userData = {
          externalWebId: 'https://alice.external.com/profile#me',
          username: 'user1'
        }

        let newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('user1')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.localAccountId).to.equal('user1.example.com/profile/card#me')
      })

      it('should use the external web id as username if no username given', () => {
        let userData = {
          externalWebId: 'https://alice.external.com/profile#me'
        }

        let newAccount = accountManager.userAccountFrom(userData)

        expect(newAccount.username).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.webId).to.equal('https://alice.external.com/profile#me')
        expect(newAccount.externalWebId).to.equal('https://alice.external.com/profile#me')
      })
    })

    describe('in single user mode', () => {
      let multiuser = false
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
      let options = { host }
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
      let emptyUserData = {}
      let userAccount = UserAccount.from(emptyUserData)
      let options = { host, multiuser: true }
      let accountManager = AccountManager.from(options)

      accountManager.getProfileGraphFor(userAccount)
        .catch(error => {
          expect(error.message).to
            .equal('Cannot fetch profile graph, missing WebId URI')
          done()
        })
    })

    it('should fetch the profile graph via LDP store', () => {
      let store = {
        getGraph: sinon.stub().returns(Promise.resolve())
      }
      let webId = 'https://alice.example.com/#me'
      let profileHostUri = 'https://alice.example.com/'

      let userData = { webId }
      let userAccount = UserAccount.from(userData)
      let options = { host, multiuser: true, store }
      let accountManager = AccountManager.from(options)

      expect(userAccount.webId).to.equal(webId)

      return accountManager.getProfileGraphFor(userAccount)
        .then(() => {
          expect(store.getGraph).to.have.been.calledWith(profileHostUri)
        })
    })
  })

  describe('saveProfileGraph()', () => {
    it('should save the profile graph via the LDP store', () => {
      let store = {
        putGraph: sinon.stub().returns(Promise.resolve())
      }
      let webId = 'https://alice.example.com/#me'
      let profileHostUri = 'https://alice.example.com/'

      let userData = { webId }
      let userAccount = UserAccount.from(userData)
      let options = { host, multiuser: true, store }
      let accountManager = AccountManager.from(options)
      let profileGraph = rdf.graph()

      return accountManager.saveProfileGraph(profileGraph, userAccount)
        .then(() => {
          expect(store.putGraph).to.have.been.calledWith(profileGraph, profileHostUri)
        })
    })
  })

  describe('rootAclFor()', () => {
    it('should return the server root .acl in single user mode', () => {
      let resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: process.cwd(),
        includeHost: false
      })
      let store = new LDP({ suffixAcl: '.acl', multiuser: false, resourceMapper })
      let options = { host, multiuser: false, store }
      let accountManager = AccountManager.from(options)

      let userAccount = UserAccount.from({ username: 'alice' })

      let rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://example.com/.acl')
    })

    it('should return the profile root .acl in multi user mode', () => {
      let resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        rootPath: process.cwd(),
        includeHost: true
      })
      let store = new LDP({ suffixAcl: '.acl', multiuser: true, resourceMapper })
      let options = { host, multiuser: true, store }
      let accountManager = AccountManager.from(options)

      let userAccount = UserAccount.from({ username: 'alice' })

      let rootAclUri = accountManager.rootAclFor(userAccount)

      expect(rootAclUri).to.equal('https://alice.example.com/.acl')
    })
  })

  describe('loadAccountRecoveryEmail()', () => {
    it('parses and returns the agent mailto from the root acl', () => {
      let userAccount = UserAccount.from({ username: 'alice' })

      let rootAclGraph = rdf.graph()
      rootAclGraph.add(
        rdf.namedNode('https://alice.example.com/.acl#owner'),
        ns.acl('agent'),
        rdf.namedNode('mailto:alice@example.com')
      )

      let store = {
        suffixAcl: '.acl',
        getGraph: sinon.stub().resolves(rootAclGraph)
      }

      let options = { host, multiuser: true, store }
      let accountManager = AccountManager.from(options)

      return accountManager.loadAccountRecoveryEmail(userAccount)
        .then(recoveryEmail => {
          expect(recoveryEmail).to.equal('alice@example.com')
        })
    })

    it('should return undefined when agent mailto is missing', () => {
      let userAccount = UserAccount.from({ username: 'alice' })

      let emptyGraph = rdf.graph()

      let store = {
        suffixAcl: '.acl',
        getGraph: sinon.stub().resolves(emptyGraph)
      }

      let options = { host, multiuser: true, store }
      let accountManager = AccountManager.from(options)

      return accountManager.loadAccountRecoveryEmail(userAccount)
        .then(recoveryEmail => {
          expect(recoveryEmail).to.be.undefined()
        })
    })
  })

  describe('passwordResetUrl()', () => {
    it('should return a token reset validation url', () => {
      let tokenService = new TokenService()
      let options = { host, multiuser: true, tokenService }

      let accountManager = AccountManager.from(options)

      let returnToUrl = 'https://example.com/resource'
      let token = '123'

      let resetUrl = accountManager.passwordResetUrl(token, returnToUrl)

      let expectedUri = 'https://example.com/account/password/change?' +
        'token=123&returnToUrl=' + returnToUrl

      expect(resetUrl).to.equal(expectedUri)
    })
  })

  describe('generateDeleteToken()', () => {
    it('should generate and store an expiring delete token', () => {
      let tokenService = new TokenService()
      let options = { host, tokenService }

      let accountManager = AccountManager.from(options)

      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId
      }

      let token = accountManager.generateDeleteToken(userAccount)

      let tokenValue = accountManager.tokenService.verify('delete-account', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('generateResetToken()', () => {
    it('should generate and store an expiring reset token', () => {
      let tokenService = new TokenService()
      let options = { host, tokenService }

      let accountManager = AccountManager.from(options)

      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId
      }

      let token = accountManager.generateResetToken(userAccount)

      let tokenValue = accountManager.tokenService.verify('reset-password', token)

      expect(tokenValue.webId).to.equal(aliceWebId)
      expect(tokenValue).to.have.property('exp')
    })
  })

  describe('sendPasswordResetEmail()', () => {
    it('should compose and send a password reset email', () => {
      let resetToken = '1234'
      let tokenService = {
        generate: sinon.stub().returns(resetToken)
      }

      let emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      let returnToUrl = 'https://example.com/resource'

      let options = { host, tokenService, emailService }
      let accountManager = AccountManager.from(options)

      accountManager.passwordResetUrl = sinon.stub().returns('reset url')

      let expectedEmailData = {
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
      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      let returnToUrl = 'https://example.com/resource'
      let options = { host }
      let accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId
      }
      let returnToUrl = 'https://example.com/resource'
      let emailService = {}
      let options = { host, emailService }

      let accountManager = AccountManager.from(options)

      accountManager.sendPasswordResetEmail(userAccount, returnToUrl)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })

  describe('sendDeleteAccountEmail()', () => {
    it('should compose and send a delete account email', () => {
      let deleteToken = '1234'
      let tokenService = {
        generate: sinon.stub().returns(deleteToken)
      }

      let emailService = {
        sendWithTemplate: sinon.stub().resolves()
      }

      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }

      let options = { host, tokenService, emailService }
      let accountManager = AccountManager.from(options)

      accountManager.getAccountDeleteUrl = sinon.stub().returns('delete account url')

      let expectedEmailData = {
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
      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId,
        email: 'alice@example.com'
      }
      let options = { host }
      let accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Email service is not set up')
          done()
        })
    })

    it('should reject if no user email is provided', done => {
      let aliceWebId = 'https://alice.example.com/#me'
      let userAccount = {
        webId: aliceWebId
      }
      let emailService = {}
      let options = { host, emailService }

      let accountManager = AccountManager.from(options)

      accountManager.sendDeleteAccountEmail(userAccount)
        .catch(error => {
          expect(error.message).to.equal('Account recovery email has not been provided')
          done()
        })
    })
  })
})
