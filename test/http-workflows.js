/*jslint node: true*/
var supertest = require('supertest');
var ldnode = require('../index');

var ldpServer = ldnode({
  root: __dirname + '/resources'
});

var server = supertest(ldpServer);

describe('HTTP Workflows', function () {
  it('can PUT JSON, then GET it back', function (done) {
    // Notably, if this path ends with .json, then the test will pass
    var path = '/can-put-json-then-get-test-artifact';
    var blob = JSON.stringify({ content: "Hello, world "});
    var contentType = 'application/json; charset=utf-8';
    server.put(path)
      .send(blob)
      .set('content-type', contentType)
      .expect(201)
      .end(function (err, res) {
        if (err) return done(err);
        get()        
      });
    function get() {
      // now try to get the thing
      server.get(path)
        .set('Accept', contentType)
        .expect(200)
        // This fails because it will be application/octet-stream; charset=utf-8
        .expect('content-type', contentType)
        .end(done);
    }
  })
  it('can PUT text/plain, then GET it back', function (done) {
    var path = '/can-put-text-then-get-test-arfifact';
    var blob = 'Hello, world (as text/plain)!'
    var contentType = 'text/plain';
    server.put(path)
      .send(blob)
      .set('content-type', contentType)
      .expect(201)
      .end(function (err, res) {
        if (err) return done(err);
        get()        
      });
    function get() {
      // now try to get the thing
      server.get(path)
        .set('Accept', contentType)
        .expect(200)
        // This fails because it will be application/octet-stream; charset=utf-8
        .expect('content-type', contentType)
        .end(done);
    }
  })
});
