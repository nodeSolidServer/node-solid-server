/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

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

    ldp.stat(filename, function(err, stats) {
        if (err) {
            // File does not exist
            if (glob.hasMagic(filename)) {
                debug("GET/HEAD -- Glob request");
                return globHandler();
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
                        return res
                            .status(err.status)
                            .send(err.message);
                    }

                    return parseLinkedData(data);
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
                    return parseLinkedData(data);
                }

                // Otherwise, just send the data
                res.status(200).send(data);
            });
        }
    });

    function globHandler() {
        glob(filename, globOptions, function(err, matches) {
            if (err || matches.length === 0) {
                debug("GET/HEAD -- No files matching the pattern");
                return res.sendStatus(404);
            }

            // Matches found
            var globGraph = $rdf.graph();
            matches.forEach(function(match) {
                try {
                    var baseUri = file.filenameToBaseUri(match, uri, ldp.root);
                    var fileData = fs.readFileSync(
                        match,
                        { encoding: "utf8" });

                    if (S(match).endsWith(".ttl") && aclAllow(match)) {
                        $rdf.parse(
                            fileData,
                            globGraph,
                            baseUri,
                            'text/turtle');
                    }
                } catch (readErr) {
                    debug('GET -- Error in globHandler' + readErr);
                    return;
                }
            });

            var turtleData = $rdf.serialize(
                undefined,
                globGraph,
                null,
                'text/turtle');
            parseLinkedData(turtleData);
        });
    }

    function aclAllow(match) {
        if (!ldp.webid) {
            return true;
        }

        var relativePath = '/' +
            path.relative(ldp.root, match);

        req.path = relativePath;
        var allow = acl.allow("Read", req, res);

        if (allow.status === 200) {
            return true;
        } else {
            return false;
        }
    }

    function parseLinkedData(turtleData) {
        var accept = header.parseAcceptHeader(req);
        var baseUri = file.filenameToBaseUri(filename, uri, ldp.root);

        // Handle Turtle Accept header
        if (accept === undefined || accept === null) {
            accept = 'text/turtle';
        }
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
            return res.status(500).send(err);
        }

        $rdf.serialize(
            undefined,
            resourceGraph,
            null,
            accept,
            function(err, result) {
                if (result === undefined || err) {
                    debug("GET/HEAD -- Serialization error: " + err);
                    return res.sendStatus(500);
                } else {
                    res.set('content-type', accept);
                    return res.status(200).send(result);
                }
            });
    }
}

var globOptions = {
    noext: true,
    nobrace: true
};

function getHandler(req, res) {
    get(req, res, true);
}

function headHandler(req, res) {
    get(req, res, false);
}

exports.handler = getHandler;
exports.headHandler = headHandler;
