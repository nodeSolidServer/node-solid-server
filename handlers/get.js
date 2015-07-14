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
var options = require('../options.js');
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');
var metaExtension = '.meta';

function get(req, res, includeBody) {
    var options = req.app.locals.ldp;
    var uri = file.uriAbs(req);

    // Add request to subscription service
    if (req.path.slice(-options.suffixChanges.length) ===
        options.suffixChanges) {
        debug("GET -- Subscribed to ", req.path);
        return subscription.subscribeToChanges(req, res);
    }

    // Set headers
    res.header('MS-Author-Via', 'SPARQL');

    // Set live updates
    if (options.live) {
        // Note not yet in
        // http://www.iana.org/assignments/link-relations/link-relations.xhtml
        header.addLink(res, req.path + options.suffixChanges, 'changes');
        // res.header('Link' , '' + req.path + options.suffixSSE + ' ; rel=events' );
        // overwrites the pevious
        res.header('Updates-Via', req.path + options.suffixChanges);
    }

    if (includeBody) {
        debug('GET -- ' + req.path);
    } else {
        debug('HEAD -- ' + req.path);
    }

    var filename = file.uriToFilename(req.path, options.root);

    // Check if file exists
    fs.stat(filename, function(err, stats) {
        if (err) {
            // File does not exist
            if (glob.hasMagic(filename)) {
                debug("GET/HEAD -- Glob request");
                return globHandler();
            }
            debug('GET/HEAD -- Read error: ' + err);
            return res.status(404).send("Can't read file: " + err);
        }

        if (stats.isDirectory()) {
            // Found a container
            if (includeBody) {
                return metadata.readContainerMetadata(filename, containerHandler);
            }
            res.status(200).send();
            res.end();
        } else {
            // Found a resource
            if (includeBody) {
                return fs.readFile(filename, { encoding: "utf8" }, fileHandler);
            }
            res.status(200).send();
            res.end();
        }
    });

    function fileHandler(err, data) {
        if (err) {
            debug('GET/HEAD -- Read error:' + err);
            return res.status(404)
                .send("Can't read file: " + err);
        }

        debug('GET/HEAD -- Read Ok. Bytes read: ' + data.length);
        var contentType = mime.lookup(filename);
        res.set('content-type', contentType);
        debug('GET/HEAD -- content-type: ' + contentType);

        // Consider acl and meta files text/turtle
        if (path.extname(filename) === options.suffixAcl ||
            path.basename(filename) === options.suffixAcl ||
            path.basename(filename) === metaExtension) {
            contentType = 'text/turtle';
        }

        // if data is text/turtle, parse it
        if (contentType === 'text/turtle') {
            return parseLinkedData(data);
        }

        // Otherwise, just send the data
        res.status(200).send(data);

    }

    function containerHandler(err, rawContainer) {
        if (err) {
            rawContainer = "";
        }

        // Parse the container
        parseContainer(rawContainer);
    }

    function globHandler() {
        glob(filename, globOptions, function(err, matches) {
            if (err || matches.length === 0) {
                debug("GET/HEAD -- No files matching the pattern");
                return res.sendStatus(404);
            }

            // Matches found
            debug("matches " + matches);
            var globGraph = $rdf.graph();
            matches.forEach(function(match) {
                try {
                    var baseUri = file.filenameToBaseUri(match, uri, options.root);
                    var fileData = fs.readFileSync(
                        match,
                        { encoding: "utf8" });

                    //TODO integrate ACL
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
        if (!options.webid) {
            return true;
        }

        var relativePath = '/' +
            path.relative(options.root, match);

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
        var baseUri = file.filenameToBaseUri(filename, uri, options.root);

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

        //TODO rdflib callbacks
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

    function parseContainer(containerData) {
        //Handle other file types
        var baseUri = file.filenameToBaseUri(filename, uri, options.root);
        var resourceGraph = $rdf.graph();
        try {
            $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
        } catch (err) {
            debug("GET/HEAD -- Error parsing data: " + err);
            return res.status(500).send(err);
        }

        debug("GET/HEAD -- Reading directory");
        fs.readdir(filename, readdirCallback);

        function readdirCallback(err, files) {
            if (err) {
                debug("GET/HEAD -- Error reading files: " + err);
                return res.sendStatus(404);
            } else {
                for (var i = 0; i < files.length; i++) {
                    if (!S(files[i]).startsWith('.')) {
                        try {
                            var stats = fs.statSync(filename + files[i]);
                            if (stats.isFile()) {
                                resourceGraph.add(resourceGraph.sym(baseUri),
                                    resourceGraph.sym(ldpVocab.contains),
                                    resourceGraph.sym(files[i]));
                            }
                        } catch (statErr) {
                            continue;
                        }
                    }
                }
                try {
                    var turtleData = $rdf.serialize(
                        undefined,
                        resourceGraph,
                        null,
                        'text/turtle');
                    parseLinkedData(turtleData);
                } catch (parseErr) {
                    debug("GET/HEAD -- Error serializing container: " + parseErr);
                    return res.sendStatus(500);
                }
            }
        }
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
