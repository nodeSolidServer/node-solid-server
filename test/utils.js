var assert = require('chai').assert;

var utils = require('../lib/utils');

describe('Utility functions', function() {

  describe('basename', function() {
    it('should return bar as relative path for /foo/bar', function() {
      assert.equal(utils.basename('/foo/bar'), 'bar');
    });
    it('should return empty as relative path for /foo/', function() {
      assert.equal(utils.basename('/foo/'), '');
    });
    it('should return empty as relative path for /', function() {
      assert.equal(utils.basename('/'), '');
    });
    it('should return empty as relative path for empty path', function() {
      assert.equal(utils.basename(''), '');
    });
    it('should return empty as relative path for undefined path', function() {
      assert.equal(utils.basename(undefined), '');
    });
  });
});