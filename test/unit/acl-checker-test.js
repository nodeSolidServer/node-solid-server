'use strict'
const proxyquire = require('proxyquire')
const debug = require('../../lib/debug').ACL
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

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

describe('ACLChecker unit test', () => {
  it('should callback with null on grant success', () => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetAlwaysGrant }
    })
    let graph = {}
    let user, mode, resource, aclUrl
    let acl = new ACLChecker(resource, { debug })
    let acls = acl.getPermissionSet({ graph, acl: aclUrl })
    return expect(acl.checkAccess(acls, user, mode))
    .to.eventually.be.true
  })
  it('should callback with error on grant failure', () => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetNeverGrant }
    })
    let graph = {}
    let user, mode, resource, aclUrl
    let acl = new ACLChecker(resource, { debug })
    let acls = acl.getPermissionSet({ graph, acl: aclUrl })
    return expect(acl.checkAccess(acls, user, mode))
    .to.be.rejectedWith('ACL file found but no matching policy found')
  })
  it('should callback with error on grant error', () => {
    let ACLChecker = proxyquire('../../lib/acl-checker', {
      'solid-permissions': { PermissionSet: PermissionSetAlwaysError }
    })
    let graph = {}
    let user, mode, resource, aclUrl
    let acl = new ACLChecker(resource, { debug })
    let acls = acl.getPermissionSet({ graph, acl: aclUrl })
    return expect(acl.checkAccess(acls, user, mode))
    .to.be.rejectedWith('Error thrown during checkAccess()')
  })
})
