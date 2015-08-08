/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');
var async = require('async');

var debug = require('../logging').handlers;
var acl = require('../acl.js');
var header = require('../header.js');
var metadata = require('../metadata.js');
var ns = require('../vocab/ns.js').ns;
var utils = require('../utils.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');
var turtleExtension = '.ttl';

// this should be moved to options
var browseSkin = 'https://linkeddata.github.io/warp/#/list/';

function get(req, res, next, includeBody) {
    var ldp = req.app.locals.ldp;
    var uri = utils.uriBase(req);
    var filename = utils.uriToFilename(req.path, ldp.root);

    // Add request to subscription service
    if (req.path.slice(-ldp.suffixChanges.length) ===
        ldp.suffixChanges) {
        debug("GET -- Subscribed to " + req.originalUrl);
        return subscription.subscribeToChanges(req, res);
    }

    // Parse accept mime types into a priority (q) ordered array
    res.acceptTypes = header.negotiateContentType(req) || 'text/turtle';

    // Set headers
    res.header('MS-Author-Via', 'SPARQL');

    // Set live updates
    if (ldp.live) {
        // Note not yet in
        // http://www.iana.org/assignments/link-relations/link-relations.xhtml
        header.addLink(res, req.originalUrl + ldp.suffixChanges, 'changes');
        // res.header('Link' , '' + req.path + ldp.suffixSSE + ' ; rel=events' );
        // overwrites the pevious
        res.header('Updates-Via', req.originalUrl + ldp.suffixChanges);
    }

    if (includeBody) {
        debug('GET -- ' + req.originalUrl);
    } else {
        debug('HEAD -- ' + req.originalUrl);
    }

    // Get resource or container
    ldp.get(filename, uri, includeBody, function(err, data, container) {

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
            return res.sendStatus(200);
        }

        // Container/resource retrieved
        if (!container) {
            var contentType = mime.lookup(filename);
            res.set('content-type', contentType);
            debug('GET/HEAD -- content-type: ' + contentType);

            // Consider acl and meta files text/turtle
            if (path.extname(filename) === ldp.suffixAcl ||
                path.basename(filename) === turtleExtension ||
                path.basename(filename) === ldp.suffixMeta) {
                contentType = 'text/turtle';
            }

            // if data is not text/turtle, just send it
            if (contentType !== 'text/turtle') {
                return res
                    .status(200)
                    .send(data);
            }
        }

        // redirect to file browser if we got text/html with highest priority
        if (container && res.acceptTypes.indexOf('text/html') === 0) {
            return res.redirect(303, browseSkin + req.protocol + '/' + req.get('host') + req.originalUrl);
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
            var globErr = new Error();
            globErr.status = 404;
            globErr.message = "No files matching glob pattern";
            return next(globErr);
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
        callback(!err);
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
        return res.status(200)
            .set('content-type', accept)
            .send(turtleData);
    }

    //Handle other file types
    var resourceGraph = $rdf.graph();
    try {
        $rdf.parse(turtleData, resourceGraph, baseUri, 'text/turtle');
    } catch (err) {
        debug("GET/HEAD -- Error parsing data: " + err);
        var parseErr = new Error();
        parseErr.status = 500;
        parseErr.message = err.message;
        return next(parseErr);
    }

    // Graph to `accept` type
    $rdf.serialize(undefined, resourceGraph, null, accept, function(err, result) {
        if (result === undefined || err) {
            debug("GET/HEAD -- Serialization error: " + err);
            var serializeErr = new Error();
            serializeErr.status = 500;
            serializeErr.message = err.message;
            return next(serializeErr);
        }

        return res
            .status(200)
            .set('content-type', accept)
            .send(result);
    });
}

function getHandler(req, res, next) {
    get(req, res, next, true);
}

function headHandler(req, res, next) {
    get(req, res, next, false);
}

exports.handler = getHandler;
exports.headHandler = headHandler;
