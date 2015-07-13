var ldnode = require('../');
var supertest = require('supertest');
var fs = require('fs');
var fsExtra = require('fs-extra');
var expect = require('chai').expect;
var assert = require('chai').assert;
var path = require('path');

function cp (src, dest) {
  return fsExtra.copySync(
    __dirname + '/' + src,
    __dirname + '/' + dest);
}

function read (file) {
  return fs.readFileSync(__dirname + '/' + file, {
      'encoding': 'utf8'
    });
}

function rm (file) {
  return fs.unlinkSync(__dirname + '/' + file);
}

function write (text, file) {
  return fs.writeFileSync(__dirname + '/' + file, text);
}


describe('PATCH', function () {
  var ldp = ldnode.createServer({
    root: __dirname + '/testfiles',
    mount: '/test'
  });
  ldp.listen(3453);
  var server = supertest('http://localhost:3453/test');

  describe('POST', function() {
    write(
      '<#current> <#temp> 123 .',
      'testfiles/emptyExample.ttl');

    it('nothing should change with an empty file', function (done) {
      server.post('/emptyExample.ttl')
        .set('content-type', 'application/sparql-update')
        .send('')
        .end(function(err, res, body){
          assert.equal(
            read('testfiles/emptyExample.ttl'),
            '\n   <#current> <#temp> 123 .\n');
          rm('testfiles/emptyExample.ttl');
          done(err);
        });
    });
  });
});