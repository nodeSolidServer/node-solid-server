// Read-Write Web:  Linked Data Server
var express = require('express'); // See http://expressjs.com/guide.html
var getRawBody = require('raw-body');
var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib.js');
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var regexp = require('node-regexp');

module.exports = function(opts) {
    opts = opts || {};

    var router = new express.Router();
    var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');
    var subscriptions = {}; // Map URI to array of watchers
    var options = {
        aclSuffix: opts.aclSuffix || process.env.ACLSUFFIX  || ",acl",
        uriBase: opts.uriBase || process.env.URIBASE || 'http://localhost:3000'+process.cwd() + '/test/',
        fileBase: opts.fileBase || process.env.FILEBASE || process.cwd() + '/test/',
        address: opts.a || opts.address || '0.0.0.0',
        port: parseInt(opts.p || process.env.PORT ||  3000, 10),
        verbose: opts.v || opts.verbose,
        changesSuffix: opts.changesSuffix || ',changes',
        ssl: opts.S || opts.ssl,
        cors: opts.cors
    };

    var debug = function() {
        if (options.verbose) console.log.apply(console, arguments);
    };

    debug("   uriBase: " + options.uriBase);
    options.pathStart = '/' + options.uriBase.split('//')[1].split('/').slice(1).join('/');
    options.prePathSlash =  options.uriBase.split('/').slice(0,3).join('/');
    debug("URI pathStart: " + options.pathStart);
    options.pathFilter = regexp().start(options.pathStart).toRegExp();
    debug("URI path filter regexp: " + options.pathFilter);
    debug("Verbose: "+options.verbose);

    var uriToFilename = function(uri) {
        if (uri.slice(0, options.pathStart.length) !== options.pathStart) {
            throw "Path '"+uri+"'not starting with base '" + options.pathStart +"'.";
        }
        var filename = options.fileBase + uri.slice(options.pathStart.length);
        debug(' -- filename ' +filename);
        return filename;
    };

    var postOrPatch = function(req, res) {
        debug('\nPOST ' +req.path);
        debug(' text length: ' + (req.text ? req.text.length : 'undefined2'));
        res.header('MS-Author-Via' , 'SPARQL' );
        var filename = uriToFilename(req.path);
        patchType = req.get('content-type');
        fileType = mime.lookup(filename);
        patchContentType = req.get('content-type');
        patchContentType = patchContentType.split(';')[0].trim(); // Ignore parameters
        targetContentType = mime.lookup(filename);
        var targetURI = options.prePathSlash + req.path;
        var patchURI = targetURI ;  // @@@ beware the triples from the patch ending up in the same place
        debug("Patch Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
        var targetKB = $rdf.graph();
        var patchKB = $rdf.graph(); // Keep the patch in a sep KB as its URI is the same ! 

        var fail = function(status, message) {
            debug("FAIL "+status+ " " + message);
            return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
        };
        switch(patchContentType) {
        case 'application/sparql-update':
            try { // Must parse relative to document's base address but patch doc should get diff URI
                debug("parsing patch ...");
                var patch = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
            } catch(e) {
                return res.status(400).send("Patch format syntax error:\n" + e + '\n');
            }
            debug("reading target file ...");
            fs.readFile(filename, 'utf8', function (err,data) {
                if (err) {
                    return res.status(404).send("Patch: Original file read error:" + err + '\n');
                }
                debug("File read OK "+data.length);
                try {
                    debug("parsing target file ...");
                    $rdf.parse(data, targetKB, targetURI, targetContentType);
                    debug("Target parsed OK ");

                } catch(e) {
                    return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
                }
                
                var target = patchKB.sym(targetURI);
                var writeFileBack = function() {
                    debug("Accumulated namespaces:" + targetKB.namespaces);
                    debug("Writeback URI base " + targetURI);
                    var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                    // debug("Writeback data: " + data);
                    fs.writeFile(filename, data, 'utf8', function(err){
                        if (err) {
                            return fail(500, "Failed to write file back after patch: "+ err);
                        } else {
                            debug("Patch applied OK");
                            res.send("Patch applied OK\n");
                            return publishDelta(req, res, patchKB, targetURI);
                        }
                    }); // end write done
                };
                
    /*
                var performPatch = function(patch, targetKB, patchCallback) { // patchCallback(err)
                
                    var doPatch = function(onDonePatch) {
                        debug("doPatch ...")
                        
                        if (patch['delete']) {
                            debug("doPatch delete "+patch['delete'])
                            var ds =  patch['delete']
                            if (bindings) ds = ds.substitute(bindings);
                            ds = ds.statements;
                            var bad = [];
                            var ds2 = ds.map(function(st){ // Find the actual statemnts in the store
                                var sts = targetKB.statementsMatching(st.subject, st.predicate, st.object, target);
                                if (sts.length === 0) {
                                    debug("NOT FOUND deletable " + st);
                                    bad.push(st);
                                } else {
                                    debug("Found deletable " + st);
                                    return sts[0]
                                }
                            });
                            if (bad.length) {
                                return fail(409, "Couldn't find to delete: " + bad[0])
                            }
                            ds2.map(function(st){
                                targetKB.remove(st);
                            });
                        };
                        
                        if (patch['insert']) {
                            debug("doPatch insert "+patch['insert'])
                            var ds =  patch['insert'];
                            if (bindings) ds = ds.substitute(bindings);
                            ds = ds.statements;
                            ds.map(function(st){st.why = target;
                                debug("Adding: " + st);
                                targetKB.add(st.subject, st.predicate, st.object, st.why)});
                        };
                        onDonePatch();
                    };

                    var bindings = null;
                    if (patch.where) {
                        debug("Processing WHERE: " + patch.where + '\n');

                        var query = new $rdf.Query('patch');
                        query.pat = patch.where;
                        query.pat.statements.map(function(st){st.why = target});

                        var bindingsFound = [];
                        debug("Processing WHERE - launching query: " + query.pat);

                        targetKB.query(query, function onBinding(binding) {
                            bindingsFound.push(binding)
                        },
                        targetKB.fetcher,
                        function onDone() {
                            if (bindingsFound.length == 0) {
                                return patchCallback("No match found to be patched:" + patch.where);
                            }
                            if (bindingsFound.length > 1) {
                                return patchCallback("Patch ambiguous. No patch done.");
                            }
                            bindings = bindingsFound[0];
                            doPatch(patchCallback);
                        });
                    } else {
                        doPatch(patchCallback)
                    };
                };
                */

                targetKB.applyPatch(patch, target, function(err){
                    if (err) {
                        return fail(409, err); // HTTP inconsistency error -- very important.
                    } else {
                        writeFileBack();
                    }
                });
                
             }); // end read file done            
            break;
            
        default:
            return fail(400, "Sorry unknowm patch content type: " + patchContentType);
        } // switch content-type
    }; // postOrPatch


    var subscribeToChanges = function(req, res) {
        var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',changes'
        if (subscriptions[targetPath] === undefined) {
            subscriptions[targetPath] = [];
        }
        subscriptions[targetPath].push({ 'request': req, 'response': res});
        res.set('content-type', 'text/n3');
        res.setTimeout(0); // Disable timeout (does this work??)
        debug("\nGET CHANGES: Now " + subscriptions[targetPath].length +  " subscriptions for " +  targetPath);
    };

    var publishDelta = function (req, res, patchKB, targetURI){
        if (! subscriptions[req.path]) return;
        var target = $rdf.sym(targetURI); // @@ target below
        var data = $rdf.serialize(undefined, patchKB, targetURI, 'text/n3');
        debug("-- Distributing change to " + req.path);
    //    debug("                change is NT: <<<<<" + patchKB.toNT() + ">>>>>\n");
    //    debug("                change is why: <<<<<" + patchKB.statements.map(function(st){
    //            return st.why.toNT()}).join(', ') + ">>>>>\n");
        debug("                change is: <<<<<" + data + ">>>>>\n");

        subscriptions[req.path].map(function(subscription){
            subscription.response.write(data);
     //       foo.pipe(subscription.response, { 'end': false});
    //        subscription.response.send(data)
        
        });
    };

    /* Request handlers */

    router.use(responseTime());
    router.use(function (req, res, next) {
        getRawBody(req, {
            length: req.headers['content-length'],
            limit: '1mb',
            encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
        }, function (err, string) {
        if (err) {
            return next(err);
        }
        req.text = string;
        next();
      });
    });

    router.get('*', function(req, res){
        if (('' +req.path).slice(- options.changesSuffix.length) === options.changesSuffix)
            return subscribeToChanges(req, res);

        res.header('MS-Author-Via' , 'SPARQL' );
        // Note not yet in http://www.iana.org/assignments/link-relations/link-relations.xhtml
        res.header('Link' , '' + req.path + options.changesSuffix + ' ; rel=changes' );
        debug('GET -- ' +req.path);
        var filename = uriToFilename(req.path);
        fs.readFile(filename, function(err, data) {
            if (err) {
                debug(' -- read error ' + err);
                res.status(404).send("Can't read file: "+ err);
            } else {
                debug(' -- read Ok ' + data.length);
                ct = mime.lookup(filename);
                res.set('content-type', ct);
                debug(' -- content-type ' + ct);
                res.send(data);
            }
        });
    });

    router.put('*', function(req, res){
        debug('PUT ' +req.path);
        debug(' text length:' + (req.text ? req.text.length : 'undefined1'));
        res.header('MS-Author-Via' , 'SPARQL' );
        var filename = uriToFilename(req.path);
        var ct1 = req.get('content-type');
        var ct2 = mime.lookup(filename);
        if (ct1 && ct2 && (ct1 !== ct2)) {
            res.status(415).send("Content type mismatch with path file.extenstion");
        }
        if (!ct2) { // @@ Later, add the extension or track metadata
            res.status(415).send("Sorry, Filename must have extension for content type");
        }
        fs.writeFile(filename, req.text,  function(err) {
            if (err) {
                debug(" ### Write error: " + err);
                return res.status(500).send("Can't write file: "+ err);
            } else {
                debug(" -- write Ok " + req.text.length);
                res.send();
            }
        }); // file write
    });

    router.delete('*', function(req, res){
        debug('DELETE ' +req.path);
    //    res.header('MS-Author-Via' , 'SPARQL' );
        var filename = uriToFilename(req.path);
        fs.unlink(filename, function(err) {
            if (err) {
                debug("   ### DELETE unlink() error: " + err);
                return res.status(404).send("Can't delete file: "+ err); // @@ best 
            } else {
                debug(" -- delete Ok " + req.text.length);
                res.send();
            }
        }); // file delete
    });

    router.post('*', postOrPatch);
    router.patch('*', postOrPatch);

    return router;
};
