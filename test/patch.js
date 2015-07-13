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
    base: __dirname + '/testfiles',
    mount: '/test'
  });
  ldp.listen(3453);
  var server = supertest('http://localhost:3453/test');

  describe('POST', function() {

    it('should be an empty resource if last triple is deleted', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'testfiles/existingTriple.ttl');
      server.post('/existingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('DELETE { :current  :temp 123 .}')
        .expect(200)
        .end(function(err, res, body){
          assert.equal(
            read('testfiles/existingTriple.ttl'),
            '\n');
          rm('testfiles/existingTriple.ttl');
          done(err);
        });
    });

    it('should add a new triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'testfiles/addingTriple.ttl');
      server.post('/addingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :test  :hello 456 .}')
        .expect(200)
        .end(function(err, res, body){
          assert.equal(
            read('testfiles/addingTriple.ttl'),
            '\n   <#current> <#temp> 123 .\n   <#test> <#hello> 456 .\n');
          rm('testfiles/addingTriple.ttl');
          done(err);
        });
    });

    it('should add value to existing triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'testfiles/addingTripleValue.ttl');
      server.post('/addingTripleValue.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp 456 .}')
        .expect(200)
        .end(function(err, res, body){
          assert.equal(
            read('testfiles/addingTripleValue.ttl'),
            '\n   <#current> <#temp> 123, 456 .\n');
          rm('testfiles/addingTripleValue.ttl');
          done(err);
        });
    });

    it('should add value to same subject', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'testfiles/addingTripleSubj.ttl');
      server.post('/addingTripleSubj.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp2 456 .}')
        .expect(200)
        .end(function(err, res, body){
          assert.equal(
            read('testfiles/addingTripleSubj.ttl'),
            '\n   <#current> <#temp2> 456; <#temp> 123 .\n');
          rm('testfiles/addingTripleSubj.ttl');
          done(err);
        });
    });

    it('nothing should change with empty patch', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'testfiles/emptyExample.ttl');
      server.post('/emptyExample.ttl')
        .set('content-type', 'application/sparql-update')
        .send('')
        .expect(200)
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