/*jslint node: true*/
"use strict";

var path = require('path');
var $rdf = require('rdflib');

var container = require('../container.js');
var file = require('../fileStore.js');
var header = require('../header.js');
var logging = require('../logging.js');
var metadata = require('../metadata.js');

var ldpVocab = require('../vocab/ldp.js');
var rdfVocab = require('../vocab/rdf.js');

module.exports.handler = function(req, res) {
    var containerPath = file.uriToFilename(req.path);
    if (metadata.isMetadataFile(containerPath))
        return res.status(404).send();
    metadata.readMetadata(containerPath, metadataCallback);

    function metadataCallback(err, rawMetadata) {
        if (err) {
            res.sendStatus(404);
            return;
        } else {
            var fileMetadata = metadata.parseMetadata(rawMetadata);
            if (fileMetadata.isContainer) {
                // Containers are always directories so it's safe to add a final slash
                // if it does not exist already
                if (containerPath.charAt(containerPath.length - 1) !== '/')
                    containerPath += '/';
                metadata.readContainerMetadata(containerPath, containerCallback);
            } else {
                res.set('Allow', 'GET,HEAD,PUT,DELETE').sendStatus(405);
                return;
            }
        }
    }

    function containerCallback(err, rawContainer) {
        if (err) {
            res.sendStatus(404);
            return;
        }
        var contentType = "";
        if (req.is('text/turtle'))
            contentType = 'text/turtle';
        else if (req.is('text/n3'))
            contentType = 'text/n3';
        else if (req.is('application/rdf+xml'))
            contentType = 'application/rdf+xml';
        else {
            res.sendStatus(415);
            return;
        }

        var slug = req.get('Slug');
        var resourcePath = container.createResourceUri(containerPath, slug);
        var resourceGraph = $rdf.graph();
        var containerGraph = $rdf.graph();

        if (resourcePath === null) {
            container.releaseResourceUri(resourcePath);
            logging.log("URI already exists or in use");
            res.sendStatus(400);
            return;
        }

        try {
            var containerBaseUri = file.filenameToBaseUri(containerPath);
            $rdf.parse(rawContainer, containerGraph,
                containerBaseUri, 'text/turtle');
        } catch (parseErr) {
            logging.log(parseErr);
            logging.log("Could not parse container:\n", rawContainer);
            container.releaseResourceUri(resourcePath);
            res.sendStatus(500);
            return;
        }

        try {
            var resourceBaseUri = file.filenameToBaseUri(resourcePath);
            $rdf.parse(req.text, resourceGraph, resourceBaseUri, contentType);
        } catch (parseErr) {
            logging.log(req.text);
            container.releaseResourceUri(resourcePath);
            res.sendStatus(400);
            return;
        }

        var resourceMetadata = header.parseMetadataFromHeader(req.get('Link'));
        header.addLinks(res, resourceMetadata);
        var resourceType = "";

        if (resourceMetadata.isBasicContainer) {
            resourceMetadata.isContainer = true;
            resourceMetadata.isResource = false;
            resourceType = ldpVocab.BasicContainer;
            resourcePath += '/';
        } else if (resourceMetadata.isDirectContainer) {
            resourceMetadata.isContainer = true;
            resourceMetadata.isResource = false;
            resourceType = ldpVocab.DirectContainer;
        } else {
            resourceMetadata.isContainer = false;
            resourceMetadata.isResource = true;
            resourceType = ldpVocab.Resource;
        }

        resourceMetadata.isResource = true;
        //TODO figure out if how to determine if RDFSource is true or false
        resourceMetadata.isSourceResource = true;

        if (resourceMetadata.isBasicContainer) {
            container.createNewContainer(resourcePath, resourceGraph,
                resourceMetadata, function(err) {
                    if (err) {
                        res.sendStatus(500);
                    } else {
                        res.set('Location', resourceBaseUri);
                        res.sendStatus(201);
                    }
                    return;
                });
        } else if (resourceMetadata.isResource) {
            container.createNewResource(containerPath, containerGraph, resourcePath,
                resourceGraph, resourceMetadata, function(err) {
                    if (err) {
                        logging.log("Error creating resource:", err);
                        res.sendStatus(500);
                    } else {
                        res.set('Location', resourceBaseUri);
                        res.sendStatus(201);
                    }
                    return;
                });
        } else {
            res.sendStatus(400);
            return;
        }
    }
};
