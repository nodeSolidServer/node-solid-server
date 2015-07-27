/*jslint node: true*/
"use strict";

var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var debug = require('../logging').handlers;
var utils = require('../utils.js');
var header = require('../header.js');
var metadata = require('../metadata.js');
var patch = require('./patch.js');

var ldpVocab = require('../vocab/ldp.js');
var rdfVocab = require('../vocab/rdf.js');

function handler(req, res) {
    var ldp = req.app.locals.ldp;
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
        contentType != 'application/rdf+xml' &&
        contentType != 'application/json+ld' &&
        contentType != 'application/nquads' &&
        contentType != 'application/n-quads') {
        debug("POST -- Invalid Content Type: " + contentType);
        return res
            .status(415)
            .send("Invalid Content Type");
    }


    var containerPath = utils.uriToFilename(req.path, ldp.root);
    debug("POST -- Container path: " + containerPath);

    // Not a container
    if (containerPath[containerPath.length - 1] != '/') {
        debug("POST -- Requested resource is not a container");
        return res
            .set('Allow', 'GET,HEAD,PUT,DELETE')
            .sendStatus(405);
    }

    debug("POST -- Content Type: " + contentType);

    var resourceMetadata = header.parseMetadataFromHeader(req.get('Link'));

    // Create resource URI
    var resourcePath = ldp.createResourceUri(
        containerPath,
        req.get('Slug'),
        resourceMetadata.isBasicContainer);

    // Check if URI is already in use
    if (resourcePath === null) {
        ldp.releaseResourceUri(resourcePath);
        debug("POST -- URI already exists or in use");
        return res.sendStatus(400);
    }

    // Creating a graph and add the req text
    var resourceGraph = $rdf.graph();
    var requestText = req.convertedText || req.text;
    var uri = utils.uriBase(req);
    var resourceBaseUri = utils.filenameToBaseUri(
        resourcePath,
        uri,
        ldp.root);

    try {
        $rdf.parse(
            requestText,
            resourceGraph,
            resourceBaseUri,
            contentType);
    } catch (parseErr) {
        debug("POST -- Error parsing resource: " + parseErr);
        ldp.releaseResourceUri(resourcePath);
        return res.sendStatus(400);
    }

    // Add header link to the resource
    header.addLinks(res, resourceMetadata);

    // Finally, either create the new resource or container
    if (resourceMetadata.isBasicContainer) {
        resourcePath += '/';
        resourceBaseUri += '/';
        ldp.createNewContainer(
            uri,
            resourcePath,
            resourceGraph,
            containerCallback);
    } else {
        ldp.createNewResource(
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
