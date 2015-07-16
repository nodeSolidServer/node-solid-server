/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var mkdirp = require('fs-extra').mkdirp;
var path = require('path');
var $rdf = require('rdflib');

var debug = require('../logging').handlers;
var file = require('../fileStore.js');
var header = require('../header.js');
var options = require('../options.js');

function handler(req, res) {
    var options = req.app.locals.ldp;
    debug("PUT -- Request path: " + req.originalUrl);
    debug("PUT -- Text length: " + (req.text ? req.text.length : 'undefined'));
    res.header('MS-Author-Via' , 'SPARQL' );

    var filePath = file.uriToFilename(req.path, options.root);

    // PUT requests not supported on containers. Use POST instead
    if (filePath[filePath.length - 1] === '/') {
        return res.status(409)
            .send("PUT to containers not supported. Use POST method instead");
    }

    writeFile(filePath, req.text, function(err) {
        if (err) {
            debug("PUT -- Write error: " + err);
            return res.status(500).send("Can't write file: "+ err);
        }
        debug("PUT -- Write Ok. Bytes written: " + req.text.length);
        return res.sendStatus(201);
    });
}

function writeFile (filePath, contents, cb) {
    mkdirp(path.dirname(filePath), function (err) {
        if (err) {
            debug("PUT -- Error creating directory: " + err);
            return cb(err);
        }
        fs.writeFile(filePath, contents, cb);
  });
}

exports.handler = handler;
