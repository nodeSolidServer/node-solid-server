/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');

var file = require('./fileStore.js');
var header = require('./header.js');
var logging = require('./logging.js');
var ldpVocab = require('./vocab/ldp.js');

var containerExtension = ".meta";

module.exports.Metadata = function() {
    this.filename = "";
    this.isResource = false;
    this.isSourceResource = false;
    this.isContainer = false;
    this.isBasicContainer = false;
    this.isDirectContainer = false;
};

module.exports.isMetadataFile = function(filename) {
    if (path.extname(filename) === containerExtension)
        return true;
    return false;
};

module.exports.hasContainerMetadata = function(directory) {
    return fs.existsSync(directory + containerExtension);
};

module.exports.writeContainerMetadata = function(directory, container, callback) {
    fs.writeFile(directory + containerExtension, container, callback);
};

module.exports.readContainerMetadata = function(directory, callback) {
    fs.readFile(directory + containerExtension, {
        'encoding': 'utf8'
    }, callback);
};

module.exports.deleteContainerMetadata = function(directory, callback) {
    fs.unlink(directory + containerExtension, callback);
};

module.exports.linksHandler = function(req, res, next) {
    var filename = file.uriToFilename(req.url);
    filename = path.join(filename, req.path);
    if (module.exports.isMetadataFile(filename)) {
        logging.log("Metadata -- Trying to access metadata file as regular file.");
        return res.send(404);
    }
    var fileMetadata = new module.exports.Metadata();
    if (S(filename).endsWith('/'))
        fileMetadata.isContainer = true;
    else
        fileMetadata.isResource = true;
    header.addLinks(res, fileMetadata);
    next();
};
