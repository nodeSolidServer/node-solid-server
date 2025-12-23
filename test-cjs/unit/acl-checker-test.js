'use strict'
const ACLChecker = require('../../lib/acl-checker')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const options = { fetch: (url, callback) => {} }

describe('ACLChecker unit test', () => {
  describe('getPossibleACLs', () => {
    it('returns all possible ACLs of the root', () => {
      const aclChecker = new ACLChecker('http://ex.org/', options)
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a regular file', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi', options)
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of an ACL file', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi.acl', options)
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })

    it('returns all possible ACLs of a directory', () => {
      const aclChecker = new ACLChecker('http://ex.org/abc/def/ghi/', options)
      expect(aclChecker.getPossibleACLs()).to.deep.equal([
        'http://ex.org/abc/def/ghi/.acl',
        'http://ex.org/abc/def/.acl',
        'http://ex.org/abc/.acl',
        'http://ex.org/.acl'
      ])
    })
  })
})
