/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');

var header = require('../header.js');
var metadata = require('../metadata.js');
var options = require('../options.js');
var logging = require('../logging.js');
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

module.exports.handler = function(req, res) {
    get(req, res, true);
};

module.exports.headHandler = function(req, res) {
    logging.log("HEAD ssdss");
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
            logging.log(' -- read error ' + err);
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
                fs.readFile(filename, fileHandler);
            else {
                res.status(200).send();
                res.end();
            }
        }
    });

    var fileHandler = function(err, data) {
        if (err) {
            logging.log(' -- read error ' + err);
            res.status(404).send("Can't read file: " + err);
        } else {
            logging.log(' -- read Ok ' + data.length);
            var ct = mime.lookup(filename);
            res.set('content-type', ct);
            logging.log(' -- content-type ' + ct);
            if (ct === 'text/turtle') {
                parseLinkedData(data);
            } else {
                res.status(200).send(data);
            }
        }
    };

    var containerHandler = function(err, rawContainer) {
        if (err) {
            res.status(404).send("Not a container");
        } else {
            parseLinkedData(rawContainer);
        }
    };

    var parseLinkedData = function(turtleData) {
        var accept = header.parseAcceptHeader(req);
        if (accept === undefined) {
            res.sendStatus(415);
            return;
        }

        var baseUri = file.filenameToBaseUri(filename);
        var resourceGraph = $rdf.graph();
        $rdf.parse(turtleData, resourceGraph, baseUri, 'text/turtle');
        var serializedData = $rdf.serialize(undefined, resourceGraph, "",
            accept, function(err, result) {
                if (result === undefined || err) {
                res.sendStatus(500);
            } else {
                res.set('content-type', accept);
                res.status(200).send(result);
            }
        });
    };
};
