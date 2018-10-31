var expect = require('chai').expect
var getQuota = require('../../lib/utils').getQuota
const path = require('path')
const read = require('../utils').read
const root = 'accounts-acl/config/templates/new-account/'
// const $rdf = require('rdflib')

describe('Quota', function () {
  var prefs = read(path.join(root, 'settings/serverSide.ttl'))
  it('Check that the file is readable and has predicate', function () {
    expect(prefs).to.be.a('string')
    expect(prefs).to.match(/storageQuota/)
  })
  it('Get the quota', function () {
    expect(getQuota(path.join('test/resources/', root), 'https://localhost')).to.equal(2000)
  })
  it('Get the quota with non-existant file', function () {
    expect(getQuota(path.join('nowhere/', root), 'https://localhost')).to.equal(Infinity)
  })
})
