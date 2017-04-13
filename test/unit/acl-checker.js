'use strict'
const proxyquire = require('proxyquire')
const chai = require('chai')
const { assert, expect } = chai
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const debug = require('../../lib/debug').ACL
const { userIdFromRequest } = require('../../lib/handlers/allow')

class PermissionSetAlwaysGrant {
  checkAccess () {
    return Promise.resolve(true)
  }
}
class PermissionSetNeverGrant {
  checkAccess () {
    return Promise.resolve(false)
  }
}
class PermissionSetAlwaysError {
  checkAccess () {
    return Promise.reject(new Error('Error thrown during checkAccess()'))
  }
}

describe('Allow handler', () => {
  let req
  let aliceWebId = 'https://alice.example.com/#me'

  beforeEach(() => {
    req = { app: { locals: {} }, session: {} }
  })

  describe('userIdFromRequest()', () => {
    it('should first look in session.userId', () => {
      req.session.userId = aliceWebId

      let userId = userIdFromRequest(req)

      expect(userId).to.equal(aliceWebId)
    })

    it('should use webIdFromClaims() if applicable', () => {
      req.app.locals.authMethod = 'oidc'
      req.claims = {}

      let webIdFromClaims = sinon.stub().returns(aliceWebId)
      req.app.locals.oidc = { webIdFromClaims }

      let userId = userIdFromRequest(req)

      expect(userId).to.equal(aliceWebId)
      expect(webIdFromClaims).to.have.been.calledWith(req.claims)
    })

    it('should return falsy if all else fails', () => {
      let userId = userIdFromRequest(req)

      expect(userId).to.not.be.ok()
    })
  })
})

describe('ACLChecker unit test', () => {
  it('should callback with null on grant success', done => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetAlwaysGrant }
    })
    let graph = {}
    let accessType = ''
    let user, mode, resource, aclUrl
    let acl = new ACLChecker({ debug })
    acl.checkAccess(graph, user, mode, resource, accessType, aclUrl, (err) => {
      assert.isUndefined(err,
        'Granted permission should result in an empty callback!')
      done()
    })
  })
  it('should callback with error on grant failure', done => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetNeverGrant }
    })
    let graph = {}
    let accessType = ''
    let user, mode, resource, aclUrl
    let acl = new ACLChecker({ debug })
    acl.checkAccess(graph, user, mode, resource, accessType, aclUrl, (err) => {
      assert.ok(err instanceof Error,
        'Denied permission should result in an error callback!')
      done()
    })
  })
  it('should callback with error on grant error', done => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetAlwaysError }
    })
    let graph = {}
    let accessType = ''
    let user, mode, resource, aclUrl
    let acl = new ACLChecker({ debug })
    acl.checkAccess(graph, user, mode, resource, accessType, aclUrl, (err) => {
      assert.ok(err instanceof Error,
        'Error during checkAccess should result in an error callback!')
      done()
    })
  })
})
