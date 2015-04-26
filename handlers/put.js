/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');

var file = require('../fileStore.js');
var header = require('../header.js');
var options = require('../options.js');
var logging = require('../logging.js');

module.exports.handler = function(req, res){
    logging.log("PUT -- Request path: " + req.path);
    logging.log("PUT -- Text length: " + (req.text ? req.text.length : 'undefined'));
    res.header('MS-Author-Via' , 'SPARQL' );

    var filename = file.uriToFilename(req.path);
    var ct1 = req.get('content-type');
    var ct2 = mime.lookup(filename);

    if (ct1 && ct2 && (ct1 !== ct2)) {
        return res.status(415).send("Content type mismatch with path file.extenstion");
    }
    if (!ct2) {
        return res.status(415).send("Sorry, Filename must have extension for content type");
    }

    fs.writeFile(filename, req.text,  function(err) {
        if (err) {
            logging.log("PUT -- Write error: " + err);
            return res.status(500).send("Can't write file: "+ err);
        } else {
            logging.log("PUT -- Write Ok. Bytes written: " + req.text.length);
            return res.sendStatus(201);
        }
    }); // file write
};
