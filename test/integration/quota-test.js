var expect = require('chai').expect
const getQuota = require('../../lib/utils').getQuota
const overQuota = require('../../lib/utils').overQuota
const path = require('path')
const read = require('../utils').read
const root = 'accounts-acl/config/templates/new-account/'
// const $rdf = require('rdflib')

describe('Get Quota', function () {
  var prefs = read(path.join(root, 'settings/serverSide.ttl'))
  it('Check that the file is readable and has predicate', function () {
    expect(prefs).to.be.a('string')
    expect(prefs).to.match(/storageQuota/)
  })
  it('Get the quota', function (done) {
    expect(getQuota(path.join('test/resources/', root), 'https://localhost')).to.eventually.equal(2000)
  })
/*  it('Get the quota with non-existant file', function () {
    expect(getQuota(path.join('nowhere/', root), 'https://localhost')).to.equal(Infinity)
  })
  it('Get the quota when the predicate is not present', function () {
    expect(getQuota('test/resources/accounts-acl/quota', 'https://localhost')).to.equal(Infinity)
  }) */
})

describe('Check if over Quota', function () {
  it('Check the quota', function () {
    expect(overQuota(path.join('test/resources/', root), 'https://localhost')).to.be.true
  })
  it('Check the quota with non-existant file', function () {
    expect(overQuota(path.join('nowhere/', root), 'https://localhost')).to.be.false
  })
  it('Check the quota when the predicate is not present', function () {
    expect(overQuota('test/resources/accounts-acl/quota', 'https://localhost')).to.be.false()
  })
})
