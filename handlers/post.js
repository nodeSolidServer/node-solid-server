/*jslint node: true*/
"use strict";

var path = require('path');
var $rdf = require('rdflib');

var container = require('../container.js');
var file = require('../fileStore.js');
var header = require('../header.js');
var logging = require('../logging.js');
var metadata = require('../metadata.js');
var patch = require('./patch.js');

var ldpVocab = require('../vocab/ldp.js');
var rdfVocab = require('../vocab/rdf.js');

module.exports.handler = function(req, res) {
    if (req.is('application/sparql')) {
        logging.log("POST -- Handling sparql query");
        return patch.handler(req, res);
    } else {
        var containerPath = file.uriToFilename(req.path);
        logging.log("POST -- Container path: " +  containerPath);
        if (metadata.isMetadataFile(containerPath)) {
            logging.log("POST -- Invalid container.");
            return res.status(404).send();
        }
        metadata.readMetadata(containerPath, metadataCallback);
    }

    function metadataCallback(err, rawMetadata) {
        if (err) {
            logging.log("POST -- Error reading metadata: " + err);
            return res.sendStatus(404);
        } else {
            var fileMetadata = metadata.parseMetadata(rawMetadata);
            if (fileMetadata.isContainer) {
                // Containers are always directories so it's safe to add a final slash
                // if it does not exist already
                if (containerPath.charAt(containerPath.length - 1) !== '/')
                    containerPath += '/';
                metadata.readContainerMetadata(containerPath, containerCallback);
            } else {
                logging.log("POST -- Requested resource is not a container");
                return res.set('Allow', 'GET,HEAD,PUT,DELETE').sendStatus(405);
            }
        }
    }

    function containerCallback(err, rawContainer) {
        if (err) {
            logging.log("POST -- Error reading container metadata: " + err);
            return res.sendStatus(404);
        }
        var contentType = "";
        if (req.is('text/turtle'))
            contentType = 'text/turtle';
        else if (req.is('text/n3'))
            contentType = 'text/n3';
        else if (req.is('application/rdf+xml'))
            contentType = 'application/rdf+xml';
        else {
            logging.log("POST -- Invalid Content Type");
            return res.status(415).send("Invalid Content Type");
        }
        logging.log("POST -- Content Type: " + contentType);

        var slug = req.get('Slug');
        var resourcePath = container.createResourceUri(containerPath, slug);
        var resourceGraph = $rdf.graph();
        var containerGraph = $rdf.graph();

        if (resourcePath === null) {
            container.releaseResourceUri(resourcePath);
            logging.log("POST -- URI already exists or in use");
            return res.sendStatus(400);
        }

        try {
            var containerBaseUri = file.filenameToBaseUri(containerPath);
            $rdf.parse(rawContainer, containerGraph,
                containerBaseUri, 'text/turtle');
        } catch (parseErr) {
            logging.log("POST -- Error parseing container: " + parseErr);
            logging.log("POST -- Could not parse container:\n" + rawContainer + "\n");
            container.releaseResourceUri(resourcePath);
            return res.sendStatus(500);
        }

        // Get the request text
        var requestText;
        if (req.convertedText) {
            requestText = req.convertedText;
        } else {
            requestText = req.text;
        }

        try {
            var resourceBaseUri = file.filenameToBaseUri(resourcePath);
            $rdf.parse(requestText, resourceGraph, resourceBaseUri, contentType);
        } catch (parseErr) {
            logging.log("POST -- Error parsing resource: " + parseErr);
            container.releaseResourceUri(resourcePath);
            return res.sendStatus(400);
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
            resourceMetadata.isSourceResource = true;
            resourceType = ldpVocab.Resource;
        }

        if (resourceMetadata.isBasicContainer) {
            container.createNewContainer(resourcePath, resourceGraph,
                resourceMetadata, function(err) {
                    if (err) {
                        logging.log("POST -- Error creating new container: " + err);
                        return res.sendStatus(500);
                    } else {
                        logging.log("POST -- Created new container " + resourceBaseUri);
                        res.set('Location', resourceBaseUri);
                        return res.sendStatus(201);
                    }
                });
        } else if (resourceMetadata.isSourceResource) {
            container.createNewResource(containerPath, containerGraph, resourcePath,
                resourceGraph, resourceMetadata, function(err) {
                    if (err) {
                        logging.log("POST -- Error creating resource: " + err);
                        return res.sendStatus(500);
                    } else {
                        logging.log("POST -- Error creating resource: " + err);
                        res.set('Location', resourceBaseUri);
                        return res.sendStatus(201);
                    }
                });
        } else {
            logging.log("POST -- Invalid metadata.");
            res.status(400).send("Invalid metadata. Check Link headers specify a resource or a basic container");
            return;
        }
    }
};
