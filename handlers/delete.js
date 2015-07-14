/*jslint node: true*/
"use strict";

var fs = require('fs');
var debug = require('../logging').handlers;
var file = require('../fileStore.js');
var metadata = require('../metadata.js');

// Delete a container or resource
function handler(req, res) {
    debug('DELETE -- ' + req.path);

    var options = req.app.locals.ldp;
    var filename = file.uriToFilename(req.path, options.root);

    // Check if resource exist
    fs.stat(filename, function(err, stats) {
        if (err) {
            debug("DELETE -- stat() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        }

        if (stats.isDirectory()) {
            // Delete container
            metadata.deleteContainerMetadata(filename, containerCallback);
        } else {
            // Delete resource
            fs.unlink(filename, fileCallback);
        }
    });

    function fileCallback(err) {
        if (err) {
            debug("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        }
        debug("DELETE -- Ok. Bytes deleted: " + req.text.length);
        res.sendStatus(200);
    }

    function containerCallback(err) {
        if (err) {
            debug("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete container: " + err);
        }
        debug("DELETE -- Ok.");
        res.sendStatus(200);
    }
}

exports.handler = handler;
