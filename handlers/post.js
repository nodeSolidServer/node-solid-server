/*jslint node: true*/
"use strict";

var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var debug = require('../logging').handlers;
var container = require('../container.js');
var file = require('../fileStore.js');
var header = require('../header.js');
var metadata = require('../metadata.js');
var patch = require('./patch.js');

var ldpVocab = require('../vocab/ldp.js');
var rdfVocab = require('../vocab/rdf.js');

function handler(req, res) {
    var options = req.app.locals.ldp;
    var contentType = req.get('content-type');

    // Handle SPARQL query
    if (contentType === 'application/sparql') {
        debug("POST -- Handling sparql query");
        return patch.handler(req, res);
    }

    // Handle SPARQL-update query
    if (contentType === 'application/sparql-update') {
        debug("POST -- Handling sparql-update query");
        return patch.handler(req, res);
    }

    // Error on invalid content-type
    if (contentType != 'text/turtle' &&
        contentType != 'text/n3' &&
        contentType != 'application/rdf+xml') {
        //TODO Handle json and nquad content types
        debug("POST -- Invalid Content Type: " + contentType);
        return res.status(415).send("Invalid Content Type");
    }


    var containerPath = file.uriToFilename(req.path, options.base);
    debug("POST -- Container path: " + containerPath);
    
    // Container not found/invalid
    if (metadata.isMetadataFile(containerPath)) {
        debug("POST -- Invalid container.");
        return res.sendStatus(404);
    }

    // Not a container
    if (containerPath[containerPath.length - 1] != '/') {
        debug("POST -- Requested resource is not a container");
        return res.set('Allow', 'GET,HEAD,PUT,DELETE')
            .sendStatus(405);
    }

    debug("POST -- Content Type: " + contentType);

    var slug = req.get('Slug');
    var resourceMetadata = header.parseMetadataFromHeader(req.get('Link'));
    var resourcePath = container.createResourceUri(
        options,
        containerPath,
        slug,
        resourceMetadata.isBasicContainer);

    if (resourcePath === null) {
        container.releaseResourceUri(options.usedURIs, resourcePath);
        debug("POST -- URI already exists or in use");
        return res.sendStatus(400);
    }

    var resourceGraph = $rdf.graph();
    // Get the request text
    // TODO make sure correct text is selected
    var requestText = req.convertedText || req.text;
    var uri = options.uri || file.uriAbs(req);
    var resourceBaseUri = file.filenameToBaseUri(
        resourcePath,
        uri,
        options.base);

    try {
        console.log(requestText);
        $rdf.parse(
            requestText,
            resourceGraph,
            uri,
            contentType);
    } catch (parseErr) {
        debug("POST -- Error parsing resource: " + parseErr);
        container.releaseResourceUri(options.usedURIs, resourcePath);
        return res.sendStatus(400);
    }

    header.addLinks(res, resourceMetadata);

    if (resourceMetadata.isBasicContainer) {
        resourcePath += '/';
        resourceBaseUri += '/';
        container.createNewContainer(
            options.usedURIs,
            uri,
            resourcePath,
            resourceGraph,
            containerCallback);
    } else {
        container.createNewResource(
            options.usedURIs,
            options.base,
            uri,
            resourcePath,
            resourceGraph,
            resourceCallback);
    }

    function containerCallback(err) {
        if (err) {
            debug("POST -- Error creating new container: " + err);
            return res.sendStatus(500);
        }
        debug("POST -- Created new container " + resourceBaseUri);
        res.set('Location', resourceBaseUri);
        return res.sendStatus(201);
    }

    function resourceCallback(err) {
        if (err) {
            debug("POST -- Error creating resource: " + err);
            return res.sendStatus(500);
        }
        res.set('Location', resourceBaseUri);
        return res.sendStatus(201);
    }
}


exports.handler = handler;
