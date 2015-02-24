/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');

var file = require('./fileStore.js');
var header = require('./header.js');
var logging = require('./logging.js');
var ldpVocab = require('./vocab/ldp.js');

var metadataExtension = ".metadata";
var containerExtension = ".container";

module.exports.Metadata = function() {
    this.filename = "";
    this.isResource = false;
    this.isSourceResource = false;
    this.isContainer = false;
    this.isBasicContainer = false;
    this.isDirectContainer = false;
};

module.exports.isMetadataFile = function(filename) {
    if (path.extname(filename) === metadataExtension ||
        path.extname(filename) === containerExtension)
        return true;
    return false;
};

module.exports.hasMetadata = function(filename) {
    return fs.existsSync(filename + metadataExtension);
};

module.exports.parseMetadata = function(rawMetadata) {
    var getProperty = function(object, property) {
        if (object[property] !== undefined) return object[property];
        else throw new ReferenceError('Property does not exists');

    };

    try {
        var jsonMetadata = JSON.parse(rawMetadata);
        var fileMetadata = new module.exports.Metadata();
        fileMetadata.filename = getProperty(jsonMetadata, 'filename');
        fileMetadata.isResource = getProperty(jsonMetadata, 'isResource');
        fileMetadata.isSourceResource = getProperty(jsonMetadata,
            'isSourceResource');
        fileMetadata.isContainer = getProperty(jsonMetadata,
            'isContainer');
        fileMetadata.isBasicContainer = getProperty(jsonMetadata,
            'isBasicContainer');
        fileMetadata.isDirectContainer = getProperty(jsonMetadata,
            'isDirectContainer');
        return fileMetadata;
    } catch (err) {
        logging.log("Could not parse metadata from source");
        return Error("Invalid metadata");
    }
};

module.exports.writeMetadata = function(filename, metadata, callback) {
    var rawMetadata = JSON.stringify(metadata);
    fs.writeFile(filename + metadataExtension, rawMetadata, {
        'encoding': 'utf8'
    }, callback);
};

module.exports.readMetadata = function(filename, callback) {
    fs.readFile(filename + metadataExtension, {
        'encoding': 'utf8'
    }, callback);
};

module.exports.deleteMetadata = function(filename, callback) {
    fs.unlink(filename + metadataExtension, callback);
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
        res.send(404);
        return;
    }
    var fileMetadata = new module.exports.Metadata();
    module.exports.readMetadata(filename, function(err, rawMetadata) {
        if (err) {
            fileMetadata.isResource = true;
        } else {
            try {
                fileMetadata = module.exports.parseMetadata(rawMetadata);
            } catch (parseErr) {
                res.send(500);
                return next(parseErr);
            }
        }
        header.addLinks(res, fileMetadata);
        next();
    });
};
