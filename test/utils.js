var assert = require('chai').assert

var utils = require('../lib/utils')

describe('Utility functions', function () {
  describe('pathBasename', function () {
    it('should return bar as relative path for /foo/bar', function () {
      assert.equal(utils.pathBasename('/foo/bar'), 'bar')
    })
    it('should return empty as relative path for /foo/', function () {
      assert.equal(utils.pathBasename('/foo/'), '')
    })
    it('should return empty as relative path for /', function () {
      assert.equal(utils.pathBasename('/'), '')
    })
    it('should return empty as relative path for empty path', function () {
      assert.equal(utils.pathBasename(''), '')
    })
    it('should return empty as relative path for undefined path', function () {
      assert.equal(utils.pathBasename(undefined), '')
    })
    it('should not decode uris', function () {
      assert.equal(utils.uriToFilename('uri%20', 'base/'), 'base/uri%20')
    })
  })
})
