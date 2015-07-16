/*jslint node: true*/
var supertest = require('supertest');
var path = require('path');
var ldnode = require('../index');
var fs = require('fs');
var S = require('string');

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