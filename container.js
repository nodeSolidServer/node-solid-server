/*jslint node: true*/
"use strict";

var fs = require('fs');
var $rdf = require('rdflib');
var path = require('path');
var S = require('string');
var uuid = require('node-uuid');
var debug = require('./logging').container;

var metadata = require('./metadata.js');
var rdfVocab = require('./vocab/rdf.js');
var ldpVocab = require('./vocab/ldp.js');

var addUriTriple = function(kb, s, o, p) {
    kb.add(kb.sym(s), kb.sym(o), kb.sym(p));
};

var turtleExtension = ".ttl";

function createRootContainer(fileBase, baseUrl) {
    if (metadata.hasContainerMetadata(fileBase)) {
        return;
    }

    var rootContainer = $rdf.graph();
    addUriTriple(
        rootContainer,
        baseUrl,
        rdfVocab.type,
        ldpVocab.Container);
    addUriTriple(
        rootContainer,
        baseUrl,
        rdfVocab.type,
        ldpVocab.BasicContainer);

    rootContainer.add(
        rootContainer.sym(baseUrl),
        rootContainer.sym('http://purl.org/dc/terms/title'),
        '"Root Container"');

    var serializedContainer = $rdf.serialize(
        undefined,
        rootContainer,
        baseUrl,
        'text/turtle');

    metadata.writeContainerMetadata(
        fileBase,
        serializedContainer,
        function(err) {
            if (err) {
                //TODO handle error
                debug("Could not write root container");
            } else {
                debug("Wrote root container to " + fileBase);
            }
        });

}

function createResourceUri(usedURIs, containerURI, slug, isBasicContainer) {
    var newPath;
    if (slug) {
        if (S(slug).endsWith(turtleExtension)) {
            newPath = path.join(containerURI, slug);
        } else {
            if (isBasicContainer) {
                newPath = path.join(containerURI, slug);
            } else {
                newPath = path.join(containerURI, slug + turtleExtension);
            }
        }
    } else {
        if (isBasicContainer) {
            newPath = path.join(containerURI, uuid.v1());
        } else {
            newPath = path.join(containerURI, uuid.v1() + turtleExtension);
        }
    }
    if (!(fs.existsSync(newPath) || containerURI in usedURIs)) {
        usedURIs[newPath] = true;
    } else {
        return null;
    }
    return newPath;
}

function releaseResourceUri(usedURIs, uri) {
    delete usedURIs[uri];
}

function createNewResource(usedURIs, fileBase, uri, resourcePath, resourceGraph, callback) {
    var resourceURI = path.relative(fileBase, resourcePath);
    //TODO write files with relative URIS.
    var rawResource = $rdf.serialize(
        undefined,
        resourceGraph,
        uri + resourceURI,
        'text/turtle');

    debug("Writing new resource to " + resourcePath);
    debug("Resource:\n" + rawResource);

    fs.writeFile(
        resourcePath,
        rawResource,
        writeResourceCallback);

    function writeResourceCallback(err) {
        if (err) {
            debug("Error writing resource: " + err);
            releaseResourceUri(usedURIs, resourcePath);
            return callback(err);
        }

        return callback(err);
    }
}

function createNewContainer(usedURIs, uri, containerPath, containerGraph, callback) {
    fs.mkdir(containerPath, mkdirCallback);

    function mkdirCallback(err) {
        if (err) {
            debug("Error creating directory for new container: " + err);
            releaseResourceUri(usedURIs, containerPath);
            return callback(err);
        }

        var rawContainer = $rdf.serialize(
            undefined,
            containerGraph,
            uri,
            'text/turtle');

        debug("rawContainer " + rawContainer);

        metadata.writeContainerMetadata(
            containerPath,
            rawContainer,
            writeContainerCallback);
    }

    function writeContainerCallback(err) {
        if (err) {
            debug("Error writing container: " + err);
            releaseResourceUri(usedURIs, containerPath);
            return callback(err);
        }

        debug("Wrote container to " + containerPath);
        releaseResourceUri(usedURIs, containerPath);
        return callback(err);

    }
}

exports.createRootContainer = createRootContainer;
exports.createResourceUri = createResourceUri;
exports.releaseResourceUri = releaseResourceUri;
exports.createNewResource = createNewResource;
exports.createNewContainer = createNewContainer;
