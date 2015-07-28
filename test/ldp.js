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

    it ('return file if file exists', function (done) {
      // file can be empty as well
      write('hello world', 'fileExists.txt');
      ldp.readFile(__dirname + '/resources/fileExists.txt', function(err, file) {
        rm('fileExists.txt');
        assert.notOk(err);
        assert.equal(file, 'hello world');
        done();
      });
    });
  });

  describe('readContainer', function () {
    it ('should return 404 if .meta is not found', function (done) {
      ldp.readContainerMeta('resources/', function(err) {
        assert.equal(err.status, 404);
        done();
      });
    });

    it ('should return content if metaFile exists', function (done) {
      // file can be empty as well
      write('', '.meta');
      ldp.readContainerMeta(__dirname + '/resources/', function(err, metaFile) {
        rm('.meta');
        assert.notOk(err);
        assert.equal(metaFile, '');
        done();
      });
    });

    it ('should work also if trailing `/` is not passed', function (done) {
      // file can be empty as well
      write('', '.meta');
      ldp.readContainerMeta(__dirname + '/resources', function(err, metaFile) {
        rm('.meta');
        assert.notOk(err);
        assert.equal(metaFile, '');
        done();
      });
    });
  });
});