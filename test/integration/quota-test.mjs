import path from 'path'
import chai from 'chai'

// Import utility functions from the ESM utils
import { read } from '../utils.mjs'
import { getQuota, overQuota } from '../../lib/utils.mjs'

const { expect } = chai

const root = 'accounts-acl/config/templates/new-account/'

describe('Get Quota', function () {
  const prefs = read(path.join(root, 'settings/serverSide.ttl'))
  it('from file to check that it is readable and has predicate', function () {
    expect(prefs).to.be.a('string')
    expect(prefs).to.match(/storageQuota/)
  })
  it('and check it', async function () {
    const quota = await getQuota(path.join('test/resources/', root), 'https://localhost')
    console.log('Quota is', quota)
    expect(quota).to.equal(2000)
  })
  it('with wrong size', async function () {
    const quota = await getQuota(path.join('test/resources/', root), 'https://localhost')
    expect(quota).to.not.equal(3000)
  })
  it('with non-existant file', async function () {
    const quota = await getQuota(path.join('nowhere/', root), 'https://localhost')
    expect(quota).to.equal(Infinity)
  })
  it('when the predicate is not present', async function () {
    const quota = await getQuota('test/resources/accounts-acl/quota', 'https://localhost')
    expect(quota).to.equal(Infinity)
  })
})

describe('Check if over Quota', function () {
  it('when it is above', async function () {
    const quota = await overQuota(path.join('test/resources/', root), 'https://localhost')
    expect(quota).to.be.true
  })
  it('with non-existant file', async function () {
    const quota = await overQuota(path.join('nowhere/', root), 'https://localhost')
    expect(quota).to.be.false
  })
  it('when the predicate is not present', async function () {
    const quota = await overQuota('test/resources/accounts-acl/quota', 'https://localhost')
    expect(quota).to.be.false
  })
})
