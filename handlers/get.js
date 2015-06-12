/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');
var S = require('string');

var header = require('../header.js');
var metadata = require('../metadata.js');
var options = require('../options.js');
var logging = require('../logging.js');
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

var ldpVocab = require('../vocab/ldp.js');

module.exports.handler = function(req, res) {
    get(req, res, true);
};

module.exports.headHandler = function(req, res) {
    get(req, res, false);
};

var get = function(req, res, includeBody) {
    // Add request to subscription service
    if (('' + req.path).slice(-options.changesSuffix.length) ===
        options.changesSuffix) {
        logging.log("Subscribed to ", req.path);
        return subscription.subscribeToChanges(req, res);
    }
    // Set headers
    res.header('MS-Author-Via', 'SPARQL');
    if (options.live) {
        // Note not yet in
        // http://www.iana.org/assignments/link-relations/link-relations.xhtml
        header.addLink(res, req.path + options.changesSuffix, 'changes');
        // res.header('Link' , '' + req.path + options.SSESuffix + ' ; rel=events' );
        // overwrites the pevious
        res.header('Updates-Via', '' + req.path + options.changesSuffix);
    }
    if (includeBody)
        logging.log('GET -- ' + req.path);
    else
        logging.log('HEAD -- ' + req.path);
    var filename = file.uriToFilename(req.path);
    fs.stat(filename, function(err, stats) {
        if (err) {
            logging.log('GET/HEAD -- Read error: ' + err);
            res.status(404).send("Can't read file: " + err);
        } else if (stats.isDirectory()) {
            if (includeBody) {
                metadata.readContainerMetadata(filename, containerHandler);
            } else {
                res.status(200).send();
                res.end();
            }
        } else {
            if (includeBody)
                fs.readFile(filename, {
                    encoding: "utf8"
                }, fileHandler);
            else {
                res.status(200).send();
                res.end();
            }
        }
    });

    var fileHandler = function(err, data) {
        if (err) {
            logging.log('GET/HEAD -- Read error:' + err);
            res.status(404).send("Can't read file: " + err);
        } else {
            logging.log('GET/HEAD -- Read Ok. Bytes read: ' + data.length);
            var ct = mime.lookup(filename);
            res.set('content-type', ct);
            logging.log('content-type: ' + ct);
            if (ct === 'text/turtle') {
                parseLinkedData(data);
            } else {
                res.status(200).send(data);
            }
        }
    };

    var containerHandler = function(err, rawContainer) {
        if (err) {
            logging.log("GET/HEAD -- Not a valid container");
            res.status(404).send("Not a container");
        } else {
            parseContainer(rawContainer);
        }
    };

    var parseLinkedData = function(turtleData) {
        var accept = header.parseAcceptHeader(req);
        var baseUri = file.filenameToBaseUri(filename);

        // Handle Turtle Accept header
        if (accept === undefined || accept === null) {
            accept = 'text/turtle';
        }
        if (accept === 'text/turtle' || accept === 'text/n3' ||
            accept == 'application/turtle' || accept === 'application/n3') {
            return res.status(200)
                .set('content-type', accept)
                .send(turtleData);
        }

        //Handle other file types
        var resourceGraph = $rdf.graph();
        try {
            $rdf.parse(turtleData, resourceGraph, baseUri, 'text/turtle');
        } catch (err) {
            logging.log("GET/HEAD -- Error parsing data: " + err);
            return res.status(500).send(err);
        }

        $rdf.serialize(undefined, resourceGraph, null,
            accept, function(err, result) {
                if (result === undefined || err) {
                    logging.log("GET/HEAD -- Serialization error: " + err);
                    return res.sendStatus(500);
                } else {
                    res.set('content-type', accept);
                    return res.status(200).send(result);
                }
            });
    };

    var parseContainer = function(containerData) {
        //Handle other file types
        var baseUri = file.filenameToBaseUri(filename);
        var resourceGraph = $rdf.graph();
        try {
            $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
        } catch (err) {
            logging.log("GET/HEAD -- Error parsing data: " + err);
            return res.status(500).send(err);
        }
        logging.log("GET/HEAD -- Reading directory");
        fs.readdir(filename, readdirCallback);

        function readdirCallback(err, files) {
            if (err) {
                logging.log("GET/HEAD -- Error reading files: " + err);
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
                    var turtleData = $rdf.serialize(undefined, resourceGraph,
                        null, 'text/turtle');
                    parseLinkedData(turtleData);
                } catch (parseErr) {
                    logging.log("GET/HEAD -- Error serializing container: " + parseErr);
                    return res.sendStatus(500);
                }
            }
        }
    };
};
