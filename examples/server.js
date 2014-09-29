
// See http://expressjs.com/guide.html

var express = require('express');
var app = express();

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib')

var ldpHttpd = require('../');

// Should be command line params:

var uriBase = '/test/' // @@
var fileBase = '/devel/github.com/linkeddata/node-ldp-httpd/test/'; //@@

var uriFilter = /\/test\/.*/

var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

var uriToFilename = function(uri) {
    if (uri.slice(0, uriBase.length) !== uriBase) {
        throw "URI not starting with base: " + uriBase;
    }
    var filename = fileBase + uri.slice(uriBase.length);
    console.log(' -- filename ' +filename);
    return filename    
};


// See https://github.com/stream-utils/raw-body
var getRawBody = require('raw-body')
//var typer      = require('media-typer')
app.use(function (req, res, next) {
    getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
    }, function (err, string) {
    if (err) {
        return next(err)
    }
    req.text = string
    next()
  })
});


app.use(uriBase, ldpHttpd);

var server = app.listen(3000, function() {
    console.log('Listening on port %d', server.address().port);
});

