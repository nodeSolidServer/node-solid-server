'use strict'
const proxyquire = require('proxyquire')
const assert = require('chai').assert
const debug = require('../../lib/debug').ACL

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
