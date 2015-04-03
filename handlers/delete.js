/*jslint node: true*/
"use strict";

var fs = require('fs');

var file = require('../fileStore.js');
var logging = require('../logging.js');
var metadata = require('../metadata.js');

module.exports.handler = function(req, res) {
    logging.log('DELETE -- ' + req.path);
    var filename = file.uriToFilename(req.path);
    fs.stat(filename, function(err, stats) {
        if (err) {
            logging.log("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        } else if (stats.isDirectory()) {
            metadata.deleteContainerMetadata(filename, containerCallback);
        } else {
            fs.unlink(filename, fileCallback);
        }
    });

    function fileCallback(err) {
        if (err) {
            logging.log("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        } else {
            //TODO remove file from container
            metadata.deleteMetadata(filename, function(err) {});
            logging.log("DELETE -- Ok. Bytes deleted: " + req.text.length);
            res.sendStatus(200);
        }
    }

    function containerCallback(err) {
        if (err) {
            logging.log("DELETE -- unlink() error: " + err);
            return res.status(404).send("Can't delete container: " + err);
        } else {
            metadata.deleteMetadata(filename, function(err) {});
            logging.log("DELETE -- Ok.");
            res.sendStatus(200);
        }
    }
};
