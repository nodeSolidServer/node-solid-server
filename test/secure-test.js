/*jslint node: true*/

var assert = require('chai').assert;
var fs = require('fs');
var request = require('request');
var S = require('string');
var supertest = require('supertest');

process.chdir('./test', undefined);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var address = 'https://localhost:3456/test/';
var aclDir = 'aclDir';
var aclExtension = '.acl';
var server = supertest(address);

var user1 = "https://user1.databox.me/profile/card#me";
var user2 = "https://user2.databox.me/profile/card#me";
var userCredentials = {
    user1: {
        cert: fs.readFileSync('testfiles/user1-cert.pem'),
        key: fs.readFileSync('testfiles/user1-key.pem')
    },
    user2: {
        cert: fs.readFileSync('testfiles/user2-cert.pem'),
        key: fs.readFileSync('testfiles/user2-key.pem')
    }
};

function createOptions(path, user) {
    var options = {
        url: address + path
    };
    if(user) {
        options.agentOptions = userCredentials[user];
    }
    return options;
}

describe('Basic HTTPS Test', function() {
    it('Should return "Hello, World!"', function(done) {
        var options = createOptions('hello.html', 'user1');
        request(options, function(error, response, body) {
            assert.equal(response.statusCode, 200);
            assert.match(response.headers['content-type'], /text\/html/);
            done();
        });
    });
});

describe("Empty ACL Test", function() {
    it("Should create container", function(done) {
        var options = createOptions('', 'user1');
        options.headers = {
            link: '<http://www.w3.org/ns/ldp#BasicContainer>;' +
                ' rel="type"',
            slug: aclDir,
            'content-type': 'text/turtle'
        };
        request.post(options, function(error, response, body) {
            assert.equal(response.statusCode, 201);
            assert.equal(response.headers.location,
                         address + aclDir + '/');
            done();
        });
    });
    it("Should create empty acl file", function(done) {
        var aclFile = aclDir + '/' + aclExtension;
        var options = createOptions(aclFile, 'user1');
        options.headers = {
            'content-type': 'text/turtle'
        };
        options.body = '';
        request.put(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 201);
            done();
        });
    });
    it("Should create test file", function(done) {
        var testFile = aclDir + '/abc';
        var options = createOptions(testFile, 'user1');
        options.headers = {
            'content-type': 'text/turtle'
        };
        options.body = '<a> <b> <c> .';
        request.put(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 201);
            done();
        });
    });
    it("Should create test file's acl file", function(done) {
        var aclFile = aclDir + '/abc.acl';
        var options = createOptions(aclFile, 'user1');
        options.headers = {
            'content-type': 'text/turtle'
        };
        options.body = '';
        request.put(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 201);
            done();
        });
    });
    it("Should access test file's acl file", function(done) {
        var aclFile = aclDir + '/abc.acl';
        var options = createOptions(aclFile, 'user1');
        options.headers = {
            accept: 'text/turtle'
        };
        request.get(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 200);
            assert.match(response.headers['content-type'], /text\/turtle/);
            done();
        });
    });
});

describe("ACL Origin Test", function() {
    var origin1 = "http://example.org/";
    var origin2 = "http://example.com/";
    it("Should PUT new ACL file", function(done) {
        var aclFile = aclDir + '/' + aclExtension;
        var aclAddress = address + aclFile;
        var options = createOptions(aclFile, 'user1');
        options.headers = {
            'content-type': 'text/turtle'
        };
        options.body = "<#Owner>\n" +
            "	<http://www.w3.org/ns/auth/acl#accessTo> <" + address + aclDir + "/" + ">, <" + aclAddress + ">;\n" +
            "	<http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            "	<http://www.w3.org/ns/auth/acl#origin> <" + origin1 + ">;\n" +
            "	<http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#Public>\n" +
            "	<http://www.w3.org/ns/auth/acl#accessTo> <" + address + aclDir + "/" + ">;\n" +
            "	<http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n" +
            "	<http://www.w3.org/ns/auth/acl#origin> <" + origin1 + ">;\n" +
            "	<http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n";
        request.put(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 201);
            done();
            //TODO triple header
            //TODO user header
        });
    });
    it("Should be able to access test directory", function(done) {
        var options = createOptions(aclDir, 'user1');
        request.head(options, function(error, response, body) {
            assert.equal(error, null);
            assert.equal(response.statusCode, 200);
            done();
        });
    });
    it("Should be able to access to test directory when origin is valid",
       function(done) {
           var options = createOptions(aclDir, 'user1');
           options.headers = {
               origin: origin1
           };
           request.head(options, function(error, response, body) {
               assert.equal(error, null);
               assert.equal(response.statusCode, 200);
               done();
           });
       });
    it("Should be denied access to test directory when origin is invalid",
       function(done) {
           var options = createOptions(aclDir, 'user1');
           options.headers = {
               origin: origin2
           };
           request.head(options, function(error, response, body) {
               assert.equal(error, null);
               assert.equal(response.statusCode, 403);
               done();
           });
       });
});
