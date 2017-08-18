'use strict'
const ACLChecker = require('../../lib/acl-checker')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

describe('ACLChecker unit test', () => {
  describe('checkAccess', () => {
    it('should callback with null on grant success', () => {
      let acl = new ACLChecker()
      let acls = { checkAccess: () => Promise.resolve(true) }
      return expect(acl.checkAccess(acls)).to.eventually.be.true
    })
    it('should callback with error on grant failure', () => {
      let acl = new ACLChecker()
      let acls = { checkAccess: () => Promise.resolve(false) }
      return expect(acl.checkAccess(acls))
      .to.be.rejectedWith('ACL file found but no matching policy found')
    })
    it('should callback with error on grant error', () => {
      let acl = new ACLChecker()
      let acls = { checkAccess: () => Promise.reject(new Error('my error')) }
      return expect(acl.checkAccess(acls)).to.be.rejectedWith('my error')
    })
  })

  describe('getPossibleACLs', () => {
    it('returns all possible ACLs of the root', () => {
      const aclChecker = new ACLChecker('http://ex.org/')
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a regular file', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi')
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of an ACL file', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi.acl')
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a directory', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi/')
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi/.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })
  })
})
