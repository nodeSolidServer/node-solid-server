/*jslint node: true*/
var assert = require('chai').assert;
var fs = require('fs');
var $rdf = require('rdflib');
var request = require('request');
var S = require('string');
var supertest = require('supertest');
var async = require('async');

// Helper functions for the FS
var rm = require('./test-utils').rm;
var write = require('./test-utils').write;
var cp = require('./test-utils').cp;
var read = require('./test-utils').read;

var ldnode = require('../index');
var ACL = require('../lib/acl').ACL;
var ns = require('../lib/vocab/ns.js').ns;

describe('Error page tests', function() {
    var errorAddress = 'http://localhost:3457/test/';

    var errorLdp = ldnode.createServer({
        root: __dirname + '/resources',
    });
    errorLdp.listen(3457);

    var errorServer = supertest(errorAddress);

    // Instance of server with error pages flag set to false
    var noErrorAddress = 'http://localhost:3458/test/';

    var noErrorLdp = ldnode.createServer({
        root: __dirname + '/resources',
        noErrorPages: true
    });
    noErrorLdp.listen(3458);

    var noErrorServer = supertest(errorAddress);


    describe('Error page test', function() {
        it('Should return 404 custom page if flag set to true',
           function(done) {
               errorServer.get('/non-existent-file.html')
                   .expect(/404 Error Page/)
                   .expect(404, done);
           });
        it('Should return 404 default page if flag set to false',
           function(done) {
               function isDefaultErrorPage(customText) {
                   var handler = function (res) {
                       if (res.text.match(customText)){
                           console.log("Not default text");
                       }
                   };
                   return handler;
               }
               noErrorServer.get('/non-existent-file.html')
                   .expect(isDefaultErrorPage('404 Error Page'))
                   .expect(404, done);
           });
    });
});
