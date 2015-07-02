/*jslint node: true*/

var assert = require('assert');
var fs = require('fs');
var request = require('request');
var S = require('string');
var supertest = require('supertest');

process.chdir('./test', undefined);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var address = 'https://localhost:3456/test/';
var server = supertest(address);
var cert = fs.readFileSync('testfiles/client-cert.pem');
var key = fs.readFileSync('testfiles/client-key.pem');
var agent = supertest.agent(server, {ca: cert});

var options = {
    url: 'https://localhost:3456/test/hello.html',
    agentOptions: {
        key: key,
        cert: cert
    }
};

describe('Hello World', function() {
    it('Should return "Hello, World!"', function(done) {
        request(options, function(error, response, body) {
            assert(response.statusCode, 200);
            assert(response.headers['content-type'], /text\/html/);
            done();
        });
    });
});
