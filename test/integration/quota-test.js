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
  it('Get the quota', async function () {
    const quota = await getQuota(path.join('test/resources/', root), 'https://localhost')
    expect(quota).to.equal(2000)
  })
  it('Get the quota with non-existant file', async function () {
    const quota = await getQuota(path.join('nowhere/', root), 'https://localhost')
    expect(quota).to.equal(Infinity)
  })
  it('Get the quota when the predicate is not present', async function () {
    const quota = await getQuota('test/resources/accounts-acl/quota', 'https://localhost')
    expect(quota).to.equal(Infinity)
  })
})

describe('Check if over Quota', function () {
  it('Check the quota', async function () {
    const quota = await overQuota(path.join('test/resources/', root), 'https://localhost')
    expect(quota).to.be.true
  })
  it('Check the quota with non-existant file', async function () {
    const quota = await overQuota(path.join('nowhere/', root), 'https://localhost')
    expect(quota).to.be.false
  })
  it('Check the quota when the predicate is not present', async function () {
    const quota = await overQuota('test/resources/accounts-acl/quota', 'https://localhost')
    expect(quota).to.be.false
  })
})
