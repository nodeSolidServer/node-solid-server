/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');

var debug = require('../logging').handlers;
var file = require('../fileStore.js');
var subscription = require('../subscription.js');

function handler(req, res) {
    var ldp = req.app.locals.ldp;
    debug('PATCH -- ' + req.originalUrl);
    debug('PATCH -- text length: ' + (req.text ? req.text.length : 'undefined2'));
    res.header('MS-Author-Via' , 'SPARQL' );
    
    var filename = file.uriToFilename(req.path, ldp.root);
    var targetContentType = mime.lookup(filename);
    var patchContentType = req.get('content-type').split(';')[0].trim(); // Ignore parameters
    var targetURI = file.uriAbs(req) + req.originalUrl;


    debug("PATCH -- Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');

    if (patchContentType === 'application/sparql') {
        sparql(filename, targetURI, req.text, function(err, result) {
            if (err) {
                return res
                    .status(err.status)
                    .send(err.message);
            }

            return res.json(result);
        });
    } else
    if (patchContentType === 'application/sparql-update') {
        return sparqlUpdate(filename, targetURI, req.text, function (err, patchKB) {
            if (err) {
                return res
                    .status(err.status)
                    .send(err.message);
            }

            if (ldp.live) {
                subscription.publishDelta(req, res, patchKB, targetURI);
            }
            debug("PATCH -- applied OK (sync)");
            res.send("Patch applied OK\n");
        });
    } else {
        return res
            .status(400)
            .send("Sorry unknowm patch content type: " + patchContentType);
    }
} // postOrPatch

function sparql (filename, targetURI, text, callback) {
    debug("PATCH -- parsing query ...");
    var patchURI = targetURI; // @@@ beware the triples from the patch ending up in the same place
    var patchKB = $rdf.graph();
    var targetKB = $rdf.graph();
    var targetContentType = mime.lookup(filename);
    var query = $rdf.SPARQLToQuery(text, false, patchKB, patchURI); // last param not used ATM

    fs.readFile(filename, { encoding: 'utf8'}, function (err, dataIn) {
        if (err) {
            return callback({
                status: 404,
                message: "Patch: Original file read error:" + err
            });
        }

        debug("PATCH -- File read OK "+dataIn.length);
        debug("PATCH -- parsing target file ...");

        try {
            $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
        } catch(e) {
            return callback({
                status: 500,
                message: "Patch: Target " + targetContentType + " file syntax error:" + e
            });
        }
        debug("PATCH -- Target parsed OK ");

        var bindingsArray = [];

        var onBindings = function(bindings) {
            var b = {}, v, x; // Map from array to object
            for (v in bindings) if (bindings.hasOwnProperty(v)){
                x = bindings[v];
                b[v] = x.uri ? { 'type': 'uri', 'value': x.uri} :
                                { 'type': 'literal', 'value': x.value };
                if (x.lang) {
                    b[v]['xml:lang'] = x.lang;
                }
                if (x.dt) {
                    b[v].dt = x.dt.uri;  // @@@ Correct? @@ check
                }
            }
            debug("PATCH -- bindings: " + JSON.stringify(b));
            bindingsArray.push(b);
        };

        var onDone = function() {
            debug("PATCH -- Query done, no. bindings: " + bindingsArray.length);
            return callback(null, {
                'head': {
                    'vars': query.vars.map(function(v){
                        return v.toNT();
                    })
                },
                'results': {
                    'bindings': bindingsArray
                }
            });
        };

        var fetcher = new  $rdf.Fetcher(targetKB, 10000, true);
        targetKB.query(query, onBindings, fetcher, onDone);
    });
}

function sparqlUpdate(filename, targetURI, text, callback) {
    var patchURI = targetURI; // @@@ beware the triples from the patch ending up in the same place
    var patchKB = $rdf.graph();
    var targetKB = $rdf.graph();
    var targetContentType = mime.lookup(filename);

    debug("PATCH -- parsing patch ...");
    var patchObject;
    try {
        // Must parse relative to document's base address but patch doc should get diff URI
        patchObject = $rdf.sparqlUpdateParser(text, patchKB, patchURI);
    } catch(e) {
        return callback({
            status: 400,
            message: "Patch format syntax error:\n" + e + '\n'
        });
    }
    debug("PATCH -- reading target file ...");

    fs.readFile(filename, { encoding: 'utf8'}, function(err, dataIn) {
        if (err) {
            return callback({
                status: 404,
                message: "Patch: Original file read error:" + err
            });
        }

        debug("PATCH -- File read OK "+dataIn.length);
        debug("PATCH -- parsing target file ...");

        try {
            $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
        } catch(e) {
            return callback({
                status: 500,
                message: "Patch: Target " + targetContentType + " file syntax error:" + e
            });
        }
        debug("PATCH -- Target parsed OK ");

        var target = patchKB.sym(targetURI);
        debug("PATCH -- Target parsed OK, patching... ");

        targetKB.applyPatch(patchObject, target, function(err){
            if (err) {
                return callback({
                    status: 409,
                    message: err
                });
            }
            debug("PATCH -- Patched. Writeback URI base " + targetURI);
            var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
            // debug("Writeback data: " + data);

            fs.writeFile(filename, data, {encoding: 'utf8'}, function(err, data) {
                if (err) {
                    return callback({
                        status: 500,
                        message: "Failed to write file back after patch: "+ err
                    });
                }
                debug("PATCH -- applied OK (sync)");
                return callback(null, patchKB);
            });
        });
    });
}

exports.handler = handler;
