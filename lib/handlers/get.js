/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');
var async = require('async');

var debug = require('../debug').handlers;
var acl = require('../acl.js');
var header = require('../header.js');
var metadata = require('../metadata.js');
var ns = require('../vocab/ns.js').ns;
var utils = require('../utils.js');
var HttpError = require('../http-error');

var ldpVocab = require('../vocab/ldp.js');

function get(req, res, next) {
    var ldp = req.app.locals.ldp;
    var uri = utils.uriBase(req);
    var filename = utils.uriToFilename(req.path, ldp.root);

    var includeBody = req.method === 'GET'

    // Parse accept mime types into a priority (q) ordered array
    res.acceptTypes = header.negotiateContentType(req) || 'text/turtle';

    // Set headers
    res.header('MS-Author-Via', 'SPARQL');

    // Set live updates
    if (ldp.live) {
        res.header('Updates-Via', utils.uriBase(req));
    }

    debug(req.method + ' -- ' + req.originalUrl);

    // Get resource or container
    ldp.get(req.path, uri, includeBody, function(err, data, container) {

        // This should be implemented in LDP.prototype.get
        if (err && err.status === 404 && glob.hasMagic(filename)) {
            debug("GET/HEAD -- Glob request");
            return globHandler(req, res, next);
        }


        if (err) {
            debug('GET/HEAD -- Read error: ' + err.status + ' ' + err.message);
            return next(err);
        }

        // Just return that file exists
        // data is of `typeof 'string'` if file is empty, but exists!
        if (data === undefined) {
            res.sendStatus(200);
            return next();
        }

        // Container/resource retrieved
        if (!container) {
            var contentType = mime.lookup(filename);
            res.set('content-type', contentType);
            debug('GET/HEAD -- content-type: ' + contentType);

            if (utils.hasSuffix(filename, ldp.turtleExtensions)) {
                contentType = 'text/turtle';
            }

            // if data is not text/turtle, just send it
            if (contentType !== 'text/turtle') {
                return res
                    .status(200)
                    .sendFile(path.resolve(filename));
            }
        }

        // redirect to file browser if we got text/html with highest priority
        if (container &&
            res.acceptTypes.indexOf('text/html') === 0 &&
            ldp.skin) {
            return res.redirect(303, ldp.skin + req.protocol + '/' + req.get('host') + req.originalUrl);
        }

        // TODO this should be added as a middleware in the routes
        res.locals.turtleData = data;
        return parseLinkedData(req, res, next);
    });
}

function globHandler(req, res, next) {
    var ldp = req.app.locals.ldp;
    var filename = utils.uriToFilename(req.path, ldp.root);
    var uri = utils.uriBase(req);

    var globOptions = {
        noext: true,
        nobrace: true
    };

    glob(filename, globOptions, function(err, matches) {
        if (err || matches.length === 0) {
            debug("GET/HEAD -- No files matching the pattern");
            return next(new HttpError({
                message: "No files matching glob pattern",
                status: 404
            }));
        }

        // Matches found
        var globGraph = $rdf.graph();

        async.each(matches, function(match, done) {
            var baseUri = utils.filenameToBaseUri(match, uri, ldp.root);
            fs.readFile(match, {encoding: "utf8"}, function(err, fileData) {
                if (err) {
                    debug('GET -- Error in globHandler' + err);
                    return done(null);
                }
                aclAllow(match, req, res, function (allowed) {
                    if (!S(match).endsWith(".ttl") || !allowed) {
                        return done(null);
                    }
                    try {
                        $rdf.parse(
                            fileData,
                            globGraph,
                            baseUri,
                            'text/turtle');
                    } catch(parseErr) {
                        debug('GET -- Error in globHandler' + parseErr);
                    }
                    return done(null);
                });
            });
        }, function () {
            var data = $rdf.serialize(
                undefined,
                globGraph,
                null,
                'text/turtle');
            // TODO this should be added as a middleware in the routes
            res.locals.turtleData = data;
            return parseLinkedData(req, res, next);
        });
    });
}

function aclAllow(match, req, res, callback) {
    var ldp = req.app.locals.ldp;

    if (!ldp.webid) {
        return callback(true);
    }

    var relativePath = '/' + path.relative(ldp.root, match);
    res.locals.path = relativePath;
    acl.allow("Read", req, res, function(err) {
        callback(err);
    });
}

function parseLinkedData(req, res, next) {
    var ldp = req.app.locals.ldp;
    var filename = utils.uriToFilename(req.path, ldp.root);
    var uri = utils.uriBase(req);
    var turtleData = res.locals.turtleData;

    var accept = header.parseAcceptRDFHeader(req) || 'text/turtle';
    var baseUri = utils.filenameToBaseUri(filename, uri, ldp.root);

    // Handle Turtle Accept header
    if (accept === 'text/turtle' ||
        accept === 'text/n3' ||
        accept === 'application/turtle' ||
        accept === 'application/n3') {
        res.status(200)
            .set('content-type', accept)
            .send(turtleData);
        return next();
    }

    //Handle other file types
    var resourceGraph = $rdf.graph();
    try {
        $rdf.parse(turtleData, resourceGraph, baseUri, 'text/turtle');
    } catch (err) {

        debug("GET/HEAD -- Error parsing data: " + err.message);
        return next(new HttpError({
            message: err.message,
            status: 500
        }));
    }

    // Graph to `accept` type
    $rdf.serialize(undefined, resourceGraph, null, accept, function(err, result) {
        if (result === undefined || err) {
            debug("GET/HEAD -- Serialization error: " + err);
            return next(new HttpError({
                message: err.message,
                status: 500
            }));
        }
        res
            .status(200)
            .set('content-type', accept)
            .send(result);

        return next();
    });
}

exports.handler = get;
