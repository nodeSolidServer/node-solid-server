/*jslint node: true*/
var supertest = require('supertest');
var path = require('path');
var fs = require('fs');
var S = require('string');
var ldnode = require('../index');

var accepts = 'application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5';

describe('formats', function () {
    var address = 'http://localhost:3457';
    var ldp = ldnode.createServer({
        root: __dirname + '/resources',
    });
    ldp.listen(3457);

    var server = supertest(address);
    describe('HTML', function() {
        it('Should return "Hello, World!"', function(done) {
            server.get('/hello.html')
                .expect('Content-type', /text\/html/)
                .expect(/Hello, world!/)
                .expect(200, done);
        });
    });

    describe('JSON-LD', function() {
        var isValidJSON = function(res) {
            var json = JSON.parse(res.text);
        };
        it('Should return JSON-LD document', function(done) {
            server.get('/patch-5-initial.ttl')
                .set('accept', 'application/ld+json')
                .expect('content-type', /application\/ld\+json/)
                .expect(200, done);
        });
        it('Should return valid JSON', function(done) {
            server.get('/patch-5-initial.ttl')
                .set('accept', 'application/ld+json')
                .expect(isValidJSON)
                .expect(200, done);
        });
    });

    describe('N-Quads', function() {
        it('Should return N-Quads document', function(done) {
            server.get('/patch-5-initial.ttl')
                .set('accept', 'application/n-quads')
                .expect('content-type', /application\/n-quads/)
                .expect(200, done);
        });
    });

    describe('n3', function() {
        it('Should return turtle document if content-type set to n3', function(done) {
            server.get('/patch-5-initial.ttl')
                .set('accept', 'text/n3')
                .expect('content-type', /text\/n3/)
                .expect(200, done);
        });
    });
});