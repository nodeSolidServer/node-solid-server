/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');
var debug = require('./logging').metadata;

var file = require('./fileStore.js');
var header = require('./header.js');
var ldpVocab = require('./vocab/ldp.js');

var metadataExtension = ".meta";

function Metadata() {
    this.filename = "";
    this.isResource = false;
    this.isSourceResource = false;
    this.isContainer = false;
    this.isBasicContainer = false;
    this.isDirectContainer = false;
}

function isMetadataFile(filename) {
    if (path.extname(filename) === metadataExtension)
        return true;
    return false;
}

function hasContainerMetadata(directory) {
    return fs.existsSync(directory + metadataExtension);
}

function writeContainerMetadata(directory, container, callback) {
    fs.writeFile(directory + metadataExtension, container, callback);
}

function readContainerMetadata(directory, callback) {
    fs.readFile(directory + metadataExtension, {
        'encoding': 'utf8'
    }, callback);
}

function deleteContainerMetadata(directory, callback) {
    fs.unlink(directory + metadataExtension, callback);
}

function linksHandler(req, res, next) {
    var options = req.app.locals.ldp;
    var filename = file.uriToFilename(req.url, options.fileBase);
    filename = path.join(filename, req.path);
    if (module.exports.isMetadataFile(filename)) {
        debug("Trying to access metadata file as regular file.");
        return res.send(404);
    }
    var fileMetadata = new module.exports.Metadata();
    if (S(filename).endsWith('/')) {
        fileMetadata.isContainer = true;
        fileMetadata.isBasicContainer = true;
    } else {
        fileMetadata.isResource = true;
    }
    header.addLinks(res, fileMetadata);
    next();
}

exports.Metadata = Metadata;
exports.isMetadataFile = isMetadataFile;
exports.hasContainerMetadata = hasContainerMetadata;
exports.writeContainerMetadata = writeContainerMetadata;
exports.readContainerMetadata = readContainerMetadata;
exports.deleteContainerMetadata = deleteContainerMetadata;
exports.linksHandler = linksHandler;
