/*jslint node: true*/
"use strict";

var fs = require('fs');
var debug = require('../logging').handlers;

var file = require('../fileStore.js');
var metadata = require('../metadata.js');

function handler(req, res) {
    var options = req.app.locals.ldp;
    debug('DELETE -- ' + req.path);
    var filename = file.uriToFilename(req.path, options.base);
    fs.stat(filename, function(err, stats) {
        if (err) {
            debug("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        } else if (stats.isDirectory()) {
            metadata.deleteContainerMetadata(filename, containerCallback);
        } else {
            fs.unlink(filename, fileCallback);
        }
    });

    function fileCallback(err) {
        if (err) {
            debug("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        } else {
            debug("DELETE -- Ok. Bytes deleted: " + req.text.length);
            res.sendStatus(200);
        }
    }

    function containerCallback(err) {
        if (err) {
            debug("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete container: " + err);
        } else {
            debug("DELETE -- Ok.");
            res.sendStatus(200);
        }
    }
}

exports.handler = handler;
