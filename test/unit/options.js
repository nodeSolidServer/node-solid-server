var assert = require('chai').assert

var options = require('../../bin/lib/options')

describe('Command line options', function () {
  describe('options', function () {
    it('is an array', function () {
      assert.equal(Array.isArray(options), true)
    })

    it('contains only `name`s that are kebab-case', function () {
      assert.equal(
        options.every(({name}) => (/^[a-z][a-z0-9-]*$/).test(name)),
        true
      )
    })
  })
})
