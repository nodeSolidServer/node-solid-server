var expect = require('chai').expect
// var getQuota = require('../../lib/utils').getQuota
const path = require('path')
const read = require('../utils').read
const host = 'localhost:3457'
var domain = host.split(':')[0]

describe('Quota', function () {
  it('Check that the file is readable', function () {
    var prefs = read(path.join('accounts/nicola.' + domain, 'settings/serverSide.ttl'))
    expect(prefs).to.be.true()
  })
})
