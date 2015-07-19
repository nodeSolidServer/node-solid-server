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
var options = require('../options.js');
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');
var metaExtension = '.meta';
var turtleExtension = '.ttl';

function get(req, res, includeBody) {
    var options = req.app.locals.ldp;
    var uri = file.uriBase(req);

    // Add request to subscription service
    if (req.path.slice(-options.suffixChanges.length) ===
        options.suffixChanges) {
        debug("GET -- Subscribed to ", req.originalUrl);
        return subscription.subscribeToChanges(req, res);
    }

    // Set headers
    res.header('MS-Author-Via', 'SPARQL');

    // Set live updates
    if (options.live) {
        // Note not yet in
        // http://www.iana.org/assignments/link-relations/link-relations.xhtml
        header.addLink(res, req.originalUrl + options.suffixChanges, 'changes');
        // res.header('Link' , '' + req.path + options.suffixSSE + ' ; rel=events' );
        // overwrites the pevious
        res.header('Updates-Via', req.originalUrl + options.suffixChanges);
    }

    if (includeBody) {
        debug('GET -- ' + req.originalUrl);
    } else {
        debug('HEAD -- ' + req.originalUrl);
    }

    var filename = file.uriToFilename(req.path, options.root);
    var baseUri = file.uriBase(req);
    var aclLink = file.getResourceLink(filename, baseUri,
                                       options.root, options.suffixAcl,
                                      metaExtension);
    var metaLink = file.getResourceLink(filename, baseUri,
                                        options.root, metaExtension,
                                       options.suffixAcl);
    header.addLink(res, aclLink, 'acl');
    header.addLink(res, metaLink, 'describedBy');

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
            var globGraph = $rdf.graph();
            matches.forEach(function(match) {
                try {
                    var baseUri = file.filenameToBaseUri(match, uri, options.root);
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

        fs.stat(filename, function(err,  containerStats) {
            if (!err) {
                resourceGraph.add(resourceGraph.sym(baseUri),
                                  ns.stat('mtime'),
                                  containerStats.mtime.getTime());
                resourceGraph.add(resourceGraph.sym(baseUri),
                                  ns.stat('size'),
                                  containerStats.size);
            }

            debug("GET/HEAD -- Reading directory");
            fs.readdir(filename, readdirCallback);
        });

        function readdirCallback(err, files) {
            if (err) {
                debug("GET/HEAD -- Error reading files: " + err);
                return res.sendStatus(404);
            } else {
                debug("Files in directory: " + files);
                for (var i = 0; i < files.length; i++) {
                    if (!S(files[i]).endsWith(metaExtension) &&
                        !S(files[i]).endsWith(options.suffixAcl)) {
                        try {
                            var stats = fs.statSync(filename + files[i]);

                            resourceGraph.add(resourceGraph.sym(baseUri),
                                              ns.ldp('contains'),
                                              resourceGraph.sym(files[i]));

                            var metaFile;
                            var fileBaseUri;
                            var fileSubject = files[i];

                            if(stats.isDirectory()) {
                                metaFile = filename + files[i] + '/' + metaExtension;
                                fileSubject += '/';
                            } else if (stats.isFile() && S(files[i]).endsWith(turtleExtension)) {
                                metaFile = filename + files[i];
                            } else {
                                metaFile = filename + files[i] + metaExtension;
                            }
                            fileBaseUri = file.filenameToBaseUri(files[i], uri, options.root);

                            var metadataGraph = $rdf.graph();
                            var rawMetadata;

                            var metaStats;
                            try {
                                metaStats = fs.statSync(metaFile);
                            } catch(statErr) {}

                            if (metaStats && metaStats.isFile()) {
                                try {
                                    rawMetadata = fs.readFileSync(metaFile, {encoding: 'utf8'});
                                    $rdf.parse(rawMetadata, metadataGraph, fileBaseUri,
                                               'text/turtle');
                                } catch (dirErr) {
                                    metadataGraph = $rdf.graph();
                                }
                            }

                            var typeStatements = metadataGraph
                                    .statementsMatching(metadataGraph.sym(fileBaseUri),
                                                        ns.rdf('type'), undefined);
                            for (var typeIndex in typeStatements) {
                                var typeStatement = typeStatements[typeIndex];
                                resourceGraph.add(resourceGraph.sym(fileSubject),
                                                  typeStatement.predicate,
                                                  typeStatement.object);

                            }

                            try {
                                var fileStats = fs.statSync(filename + files[i]);
                                resourceGraph.add(metadataGraph.sym(fileSubject),
                                                  ns.stat('mtime'),
                                                  fileStats.mtime.getTime());
                                resourceGraph.add(metadataGraph.sym(fileSubject),
                                                  ns.stat('size'),
                                                  fileStats.size);
                            } catch (statErr) {}
                        } catch (getErr) {
                            debug("Error getting container: " + getErr);
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
