/*jslint node: true*/
"use strict";

var N3 = require('n3');
var jsonld = require('jsonld');
var async = require('async');
var debug = require('./logging').parse;

function parseHandler(req, res, next) {
    convertToTurtle(req.text, req, function(err, result) {
        if (!err) {
            req.convertedText = result;
        } else {
            debug("Error parsing request: " + err);
        }
        return next();
    });
}

function convertToTurtle(rawDocument, req,
    convertCallback) {
    if (req.is('application/ld+json') ||
        req.is('application/nquads') || req.is('application/n-quads')) {
        var contentType = req.get('content-type').split(';')[0].trim();
        parse(rawDocument, contentType, convertCallback);
    } else {
        convertCallback(null, rawDocument);
    }
}

function parse(rawDocument, contentType, convertCallback) {
    var n3Parser = N3.Parser();
    var n3Writer;
    var triples = [];
    var prefixes = {};

    if (contentType === 'application/ld+json') {
        var jsonDocument;
        try {
            jsonDocument = JSON.parse(rawDocument);
        } catch (err) {
            convertCallback(err, null);
        }
        jsonld.toRDF(jsonDocument, {
            format: 'application/nquads'
        }, nquadCallback);
    } else if (contentType === 'application/nquads' ||
        contentType === 'application/n-quads') {
        nquadCallback(null, rawDocument);
    } else {
        convertCallback(new Error("Wrong content type"), null);
    }

    function nquadCallback(err, nquads) {
        if (err) {
            debug("Error parsing nquads: " + err);
            convertCallback(err, null);
        }
        try {
            n3Parser.parse(nquads, tripleCallback, prefixCallback);
        } catch (err) {
            convertCallback(err, null);
        }
    }

    function tripleCallback(err, triple, prefixes) {
        if (err) {
            convertCallback(err, null);
        }
        if (triple) {
            triples.push(triple);
        } else {
            n3Writer = N3.Writer({
                prefixes: prefixes
            });
            for (var i = 0; i < triples.length; i++) {
                n3Writer.addTriple(triples[i]);
            }
            n3Writer.end(convertCallback);
        }
    }

    function prefixCallback(prefix, iri) {
        prefixes[prefix] = iri;
    }
}

exports.parseHandler = parseHandler;
exports.convertToTurtle = convertToTurtle;
