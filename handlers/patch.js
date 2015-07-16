/*jslint node: true*/
"use strict";

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');

var debug = require('../logging').handlers;
var file = require('../fileStore.js');
var subscription = require('../subscription.js');
var options = require('../options.js');

function handler(req, res) {
    var options = req.app.locals.ldp;
    debug('PATCH -- ' +req.path);
    debug('PATCH -- text length: ' + (req.text ? req.text.length : 'undefined2'));
    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = file.uriToFilename(req.path, options.root);
    var patchContentType = req.get('content-type').split(';')[0].trim(); // Ignore parameters
    var targetContentType = mime.lookup(filename);
    var targetURI = req.protocol + '://' + req.get('host') + options.mount + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the patch ending up in the same place
    debug("PATCH -- Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KB as its URI is the same !
    var patchObject;
    var dataIn;

    var fail = function(status, message) {
        debug("FAIL "+status+ " " + message);
        return res.status(status)
            .send('<html><body>\n'+ message+ '\n</body></html>\n');
    };

    switch(patchContentType) {
        case 'application/sparql':
            debug("PATCH -- parsing query ...");
            var query = $rdf.SPARQLToQuery(req.text, false, patchKB, patchURI); // last param not used ATM

            try {
                dataIn = fs.readFileSync(filename, { encoding: 'utf8'});
            } catch (err) {
                return res.status(404)
                    .send("Patch: Original file read error:" + err + '\n');
            }

            debug("PATCH -- File read OK "+dataIn.length);

            try {
                debug("PATCH -- parsing target file ...");
                $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
                debug("PATCH -- Target parsed OK ");
            } catch(e) {
                return res.status(500)
                    .send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }

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
                res.json({
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

        break;

    case 'application/sparql-update':
        try {
            // Must parse relative to document's base address but patch doc should get diff URI
            debug("PATCH -- parsing patch ...");
            patchObject = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
        } catch(e) {
            return res.status(400)
                .send("Patch format syntax error:\n" + e + '\n');
        }
        debug("PATCH -- reading target file ...");

        if (true) {  /// USe synchronous style to prevent interruption
            try {
                dataIn = fs.readFileSync(filename, { encoding: 'utf8'});
            } catch (err) {
                return res.status(404)
                    .send("Patch: Original file read error:" + err + '\n');
            }

            debug("PATCH -- File read OK "+dataIn.length);

            try {
                debug("PATCH -- parsing target file ...");
                $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
                debug("PATCH -- Target parsed OK ");
            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }

            // debug("Pre check ");
            // targetKB.check(); // @@
            var target = patchKB.sym(targetURI);
            debug("PATCH -- Target parsed OK, patching... ");

            targetKB.applyPatch(patchObject, target, function(err){
                if (err) {
                    return fail(409, err); // HTTP inconsistency error -- very important.
                }
                debug("PATCH -- Patched. Writeback URI base " + targetURI);
                var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                // debug("Writeback data: " + data);
                try {
                    fs.writeFileSync(filename, data, { encoding: 'utf8'});
                } catch (er) {
                    return fail(500, "Failed to write file back after patch: "+ err);
                }
                debug("PATCH -- applied OK (sync)");
                res.send("Patch applied OK\n");
                if (options.live) {
                    subscription.publishDelta(req, res, patchKB, targetURI);
                }
                return;
            });

        } else { // Assync

            fs.readFile(filename, { encoding: 'utf8'}, function (err,data) {
                if (err) {
                    return res.status(404).send("Patch: Original file read error:" + err + '\n');
                }
                debug("PATCH -- File read OK "+data.length);
                try {
                    debug("PATCH -- parsing target file ...");
                    $rdf.parse(data, targetKB, targetURI, targetContentType);
                    debug("PATCH -- Target parsed OK ");

                } catch(e) {
                    return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
                }

                var target = patchKB.sym(targetURI);

                var writeFileBack = function() {
                    // debug("Accumulated namespaces:" + targetKB.namespaces)
                    debug("PATCH -- Writeback URI base " + targetURI);
                    var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                    // debug("Writeback data: " + data);

                    fs.writeFile(filename, data, { encoding: 'utf8'}, function(err){
                        if (err) {
                            return fail(500, "Failed to write file back after patch: "+ err);
                        }
                        debug("PATCH -- applied OK");
                        res.send("Patch applied OK\n");
                        if (options.live) {
                            subscription.publishDelta(req, res, patchKB, targetURI);
                        }
                        return;
                    }); // end write done
                };

                targetKB.applyPatch(patchObject, target, function(err){
                    if (err) {
                        return fail(409, err); // HTTP inconsistency error -- very important.
                    }
                    writeFileBack();
                });

            }); // end read file done

        } // if
        break;

    default:
        return fail(400, "Sorry unknowm patch content type: " + patchContentType);
    } // switch content-type
} // postOrPatch

exports.handler = handler;
