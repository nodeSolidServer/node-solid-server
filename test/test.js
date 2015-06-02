/*jslint node: true*/

var assert = require('assert');
var supertest = require('supertest');
var server = supertest('http://localhost:3456/test/');

describe('Hello World', function() {
    it('Should return "Hello, World!"', function(done) {
        server.get('/hello.html')
        .expect('Content-type', /text\/html/)
        .expect(/Hello, world!/)
        .expect(200, done);
    });
});

describe('Root container', function() {
    it('Should exists', function(done) {
        server.get('/')
        .expect(200, done);
    });
    it('Should be a turtle file by default', function(done) {
        server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done);
    });
});

describe('JSON-LD support', function() {
    var isValidJSON = function(res) {
        var json = JSON.parse(res.text);
    };
    it('Should return JSON-LD document', function(done) {
        server.get('/patch-5-initial.ttl')
        .set('accept', 'application/json+ld')
        .expect('content-type', /application\/json\+ld/)
        .expect(200, done);
    });
    it('Should return valid JSON', function(done) {
        server.get('/patch-5-initial.ttl')
        .set('accept', 'application/json+ld')
        .expect(isValidJSON)
        .expect(200, done);
    });
});

describe('N-Quads support', function() {
    it('Should return N-Quads document', function(done) {
        server.get('/patch-5-initial.ttl')
        .set('accept', 'application/n-quads')
        .expect('content-type', /application\/n-quads/)
        .expect(200, done);
    });
});

describe('n3 support', function() {
    it('Should return turtle document if content-type set to n3', function(done) {
        server.get('/patch-5-initial.ttl')
        .set('accept', 'text/n3')
        .expect('content-type', /text\/n3/)
        .expect(200, done);
    });
});

describe('GET API', function() {
    it('Should return 404 for non-existent resource', function(done) {
        server.get('/invalidfile.foo')
        .expect(404, done);
    });
    it('Should return container link for directories', function(done) {
        server.get('/')
        .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Container/ )
        .expect(200, done);
    });
    it('Should return resource link for files', function(done) {
        server.get('/hello.html')
        .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/ )
        .expect(200, done);
    });
});
