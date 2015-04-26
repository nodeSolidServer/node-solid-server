/*jslint node: true*/
"use strict";

var fs = require('fs');
var $rdf = require('rdflib');
var path = require('path');
var S = require('string');
var uuid = require('node-uuid');

var logging = require('./logging.js');
var metadata = require('./metadata.js');
var options = require('./options.js');

var rdfVocab = require('./vocab/rdf.js');
var ldpVocab = require('./vocab/ldp.js');

var addUriTriple = function(kb, s, o, p) {
    kb.add(kb.sym(s), kb.sym(o), kb.sym(p));
};

var usedURIs = {};

var turtleExtension = ".ttl";

module.exports.createRootContainer = function() {
    if (!metadata.hasContainerMetadata(options.fileBase)) {
        var rootContainer = $rdf.graph();
        addUriTriple(rootContainer, options.pathStart,
            rdfVocab.type, ldpVocab.Container);
        addUriTriple(rootContainer, options.pathStart,
            rdfVocab.type, ldpVocab.BasicContainer);
        rootContainer.add(rootContainer.sym(options.pathStart),
            rootContainer.sym('http://purl.org/dc/terms/title'),
            '"Root Container"');
        var serializedContainer = $rdf.serialize(undefined, rootContainer,
            options.pathStart, 'text/turtle');
        metadata.writeContainerMetadata(options.fileBase,
            serializedContainer, function(err) {
                if (err) {
                    //TODO handle error
                    logging.log(
                        "Container -- Could not write root container");
                } else {
                    logging.log(
                        "Container -- Wrote root container to " +
                        options.fileBase);
                }
            });
    }
};

module.exports.createResourceUri = function(containerURI, slug) {
    var newPath;
    if (slug) {
        if (S(slug).endsWith(turtleExtension)) {
            newPath = path.join(containerURI, slug);
        } else {
            newPath = path.join(containerURI, slug + turtleExtension);
        }
    } else {
        newPath = path.join(containerURI, uuid.v1() + turtleExtension);
    }
    if (!(fs.existsSync(newPath) || containerURI in usedURIs)) {
        usedURIs[newPath] = true;
    } else {
        return null;
    }
    return newPath;
};

module.exports.releaseResourceUri = function(uri) {
    delete usedURIs[uri];
};

module.exports.createNewResource = function(resourcePath,
    resourceGraph, callback) {
    var resourceURI = path.relative(options.fileBase, resourcePath);
    //TODO write files with relative URIS.
    var rawResource = $rdf.serialize(undefined,
        resourceGraph, options.uriBase + resourceURI, 'text/turtle');
    logging.log("Container -- Writing new resource to " + resourcePath);
    fs.writeFile(resourcePath, rawResource, writeResourceCallback);

    function writeResourceCallback(err) {
        if (err) {
            logging.log("Container -- Error writing resource: " + err);
            module.exports.releaseResourceUri(resourcePath);
            callback(err);
        } else {
            return callback(err);
        }
    }
};

module.exports.createNewContainer = function(containerPath,
    containerGraph, callback) {
    fs.mkdir(containerPath, mkdirCallback);

    function mkdirCallback(err) {
        if (err) {
            logging.log("Container -- Error creating directory" +
                " for new container: " + err);
            module.exports.releaseResourceUri(containerPath);
            return callback(err);
        } else {
            var rawContainer = $rdf.serialize(undefined, containerGraph,
                options.uriBase, 'text/turtle');
            metadata.writeContainerMetadata(containerPath, rawContainer,
                writeContainerCallback);
        }
    }

    function writeContainerCallback(err) {
        if (err) {
            logging.log("Container -- Error writing container: " + err);
            module.exports.releaseResourceUri(containerPath);
            return callback(err);
        } else {
            module.exports.releaseResourceUri(containerPath);
            return callback(err);
        }
    }
};
