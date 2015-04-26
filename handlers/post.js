/*jslint node: true*/
"use strict";

var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

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
    } else if (req.is('application/sparql-update')) {
        logging.log("POST -- Handling sparql-update query");
        return patch.handler(req, res);
    } else {
        var containerPath = file.uriToFilename(req.path);
        logging.log("POST -- Container path: " + containerPath);
        if (metadata.isMetadataFile(containerPath)) {
            logging.log("POST -- Invalid container.");
            return res.status(404).send();
        }
        if (S(containerPath).endsWith('/')) {
            var contentType = "";
            if (req.is('text/turtle'))
                contentType = 'text/turtle';
            else if (req.is('text/n3'))
                contentType = 'text/n3';
            else if (req.is('application/rdf+xml'))
                contentType = 'application/rdf+xml';
            else {
                //TODO Handle json and nquad content types
                logging.log("POST -- Invalid Content Type");
                return res.status(415).send("Invalid Content Type");
            }
            logging.log("POST -- Content Type: " + contentType);

            var slug = req.get('Slug');
            var resourcePath = container.createResourceUri(containerPath, slug);
            var resourceGraph = $rdf.graph();

            if (resourcePath === null) {
                container.releaseResourceUri(resourcePath);
                logging.log("POST -- URI already exists or in use");
                return res.sendStatus(400);
            }

            // Get the request text
            // TODO make sure correct text is selected
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

            if (resourceMetadata.isBasicContainer) {
                resourcePath += '/';
                container.createNewContainer(resourcePath, resourceGraph,
                    containerCallback);
            } else {
                container.createNewResource(resourcePath,
                    resourceGraph, resourceCallback);
            }
        } else {
            logging.log("POST -- Requested resource is not a container");
            return res.set('Allow', 'GET,HEAD,PUT,DELETE').sendStatus(405);
        }
    }

    function containerCallback(err) {
        if (err) {
            logging.log(
                "POST -- Error creating new container: " + err);
            return res.sendStatus(500);
        } else {
            logging.log(
                "POST -- Created new container " + resourceBaseUri);
            res.set('Location', resourceBaseUri);
            return res.sendStatus(201);
        }
    }

    function resourceCallback(err) {
        if (err) {
            logging.log(
                "POST -- Error creating resource: " + err);
            return res.sendStatus(500);
        } else {
            res.set('Location', resourceBaseUri);
            return res.sendStatus(201);
        }
    }
};
