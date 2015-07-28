var LDP = require('../lib/ldp');
var assert = require('chai').assert;
// Helper functions for the FS
var rm = require('./test-utils').rm;
var write = require('./test-utils').write;
var cp = require('./test-utils').cp;
var read = require('./test-utils').read;

describe('LDP', function () {
  var ldp = new LDP();

  describe('readFile', function () {
    it ('return 404 if file does not exist', function (done) {
      ldp.readFile('resources/unexistent.ttl', function(err) {
        assert.equal(err.status, 404);
        done();
      });
    });

  });

  describe('LDP', function () {

  });

  describe('LDP', function () {

  });

});