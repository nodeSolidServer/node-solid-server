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
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');
var metaExtension = '.meta';
var turtleExtension = '.ttl';

function get(req, res, includeBody) {
    var ldp = req.app.locals.ldp;
    var uri = file.uriBase(req);

    // Add request to subscription service
    if (req.path.slice(-ldp.suffixChanges.length) ===
        ldp.suffixChanges) {
        debug("GET -- Subscribed to ", req.originalUrl);
        return subscription.subscribeToChanges(req, res);
    }

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

    var filename = file.uriToFilename(req.path, ldp.root);
    var baseUri = file.uriBase(req);

    var aclLink = file.getResourceLink(
        filename, baseUri,
        ldp.root, ldp.suffixAcl,
        metaExtension);

    var metaLink = file.getResourceLink(
        filename, baseUri,
        ldp.root, metaExtension,
        ldp.suffixAcl);

    header.addLink(res, aclLink, 'acl');
    header.addLink(res, metaLink, 'describedBy');

    ldp.stat(filename, function(err, stats) {
        // File does not exist
        if (err) {
            // Check in case it is a pattern, e.g. /*.js
            if (glob.hasMagic(filename)) {
                debug("GET/HEAD -- Glob request");
                return globHandler(req, res);
            }
            debug('GET/HEAD -- Read error: ' + err);
            return res
                .status(404)
                .send("Can't read file: " + err);
        }

        // Just return resource exists
        if (!includeBody) {
            return res.sendStatus(200);
        }

        // Found a container
        if (stats.isDirectory()) {
            return ldp.readContainerMeta(filename, function(err, data) {
                if (err) {
                    debug('GET/HEAD -- Read error:' + err);
                    return res
                        .status(err.status)
                        .send(err.message);
                }
                ldp.listContainer(filename, uri, data, function (err, data) {
                    if (err) {
                        debug('GET/HEAD -- Read error:' + err);
                        return res
                            .status(err.status)
                            .send(err.message);
                    }
                    // TODO this should be added as a middleware in the routes
                    res.locals.turtleData = data;
                    return parseLinkedData(req, res);
                });
            });
        }
        else {
            return ldp.readFile(filename, function (err, data) {
                // Error when reading
                if (err) {
                    debug('GET/HEAD -- Read error:' + err);
                    return res
                        .status(err.status)
                        .send(err.message);
                }

                // File retrieved
                debug('GET/HEAD -- Read Ok. Bytes read: ' + data.length);

                var contentType = mime.lookup(filename);
                res.set('content-type', contentType);
                debug('GET/HEAD -- content-type: ' + contentType);

                // Consider acl and meta files text/turtle
                if (path.extname(filename) === ldp.suffixAcl ||
                    path.basename(filename) === turtleExtension ||
                    path.basename(filename) === metaExtension) {
                    contentType = 'text/turtle';
                }

                // if data is text/turtle, parse it
                if (contentType === 'text/turtle') {
                    // TODO this should be added as a middleware in the routes
                    res.locals.turtleData = data;
                    return parseLinkedData(req, res);
                }

                // Otherwise, just send the data
                return res
                    .status(200)
                    .send(data);
            });
        }
    });

}

function globHandler(req, res) {
    var ldp = req.app.locals.ldp;
    var filename = file.uriToFilename(req.path, ldp.root);
    var uri = file.uriBase(req);

    var globOptions = {
        noext: true,
        nobrace: true
    };

    glob(filename, globOptions, function(err, matches) {
        if (err || matches.length === 0) {
            debug("GET/HEAD -- No files matching the pattern");
            return res.sendStatus(404);
        }

        // Matches found
        var globGraph = $rdf.graph();

        async.each(matches, function(match, done) {
            var baseUri = file.filenameToBaseUri(match, uri, ldp.root);
            fs.readFile(match, {encoding: "utf8"}, function(err, fileData) {
                if (err) {
                    debug('GET -- Error in globHandler' + err);
                    return done(null);
                }
                if (!S(match).endsWith(".ttl") || !aclAllow(match, req, res)) {
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
        }, function () {
            var data = $rdf.serialize(
                undefined,
                globGraph,
                null,
                'text/turtle');
            // TODO this should be added as a middleware in the routes
            res.locals.turtleData = data;
            return parseLinkedData(req, res);
        });
    });
}

function aclAllow(match, req, res) {
    var ldp = req.app.locals.ldp;

    if (!ldp.webid) {
        return true;
    }

    var relativePath = '/' +
        path.relative(ldp.root, match);

    res.locals.path = relativePath;
    var allow = acl.allow("Read", req, res);

    if (allow.status === 200) {
        return true;
    } else {
        return false;
    }
}

function parseLinkedData(req, res) {
    var ldp = req.app.locals.ldp;
    var filename = file.uriToFilename(req.path, ldp.root);
    var uri = file.uriBase(req);
    var turtleData = res.locals.turtleData;

    var accept = header.parseAcceptHeader(req) || 'text/turtle';
    var baseUri = file.filenameToBaseUri(filename, uri, ldp.root);

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
        return res
            .status(500)
            .send(err);
    }

    $rdf.serialize(undefined, resourceGraph, null, accept, function(err, result) {
        if (result === undefined || err) {
            debug("GET/HEAD -- Serialization error: " + err);
            return res.sendStatus(500);
        }

        return res
            .status(200)
            .set('content-type', accept)
            .send(result);
    });
}


function getHandler(req, res) {
    get(req, res, true);
}

function headHandler(req, res) {
    get(req, res, false);
}

exports.handler = getHandler;
exports.headHandler = headHandler;
