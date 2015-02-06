var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');

var subscription = require('../subscription.js');
var options = require('../options.js');
var logging = require('../logging.js');

module.exports.handler = function(req, res) {
    logging.log('\nPOST ' +req.path);
    logging.log(' text length: ' + (req.text ? req.text.length : 'undefined2'));
    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = uriToFilename(req.path);
    var patchContentType = req.get('content-type').split(';')[0].trim(); // Ignore parameters
    var targetContentType = mime.lookup(filename);
    var targetURI = options.prePathSlash + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the patch ending up in the same place
    logging.log("Patch Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KB as its URI is the same !
    var patchObject;
    var fail = function(status, message) {
        logging.log("FAIL "+status+ " " + message);
        return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
    };
    switch(patchContentType) {
        case 'application/sparql':
            logging.log("parsing query ...");
            var query = $rdf.SPARQLToQuery(req.text, false, patchKB, patchURI); // last param not used ATM
            var dataIn;
            try {
                dataIn = fs.readFileSync(filename, { encoding: 'utf8'});
            } catch (err) {
                return res.status(404).send("Patch: Original file read error:" + err + '\n');
            }
            logging.log("File read OK "+dataIn.length);
            try {
                logging.log("parsing target file ...");
                $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
                logging.log("Target parsed OK ");
            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
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
                logging.log("    bindings: " + JSON.stringify(b));
                bindingsArray.push(b);
            };
            var onDone = function() {
                logging.log("Query done, no. bindings: " + bindingsArray.length);
                res.json( { 'head': { 'vars': query.vars.map(function(v){return v.toNT();}) }, 'results': { 'bindings': bindingsArray}});
    //          res.set('content-type', 'application/json')
    //          res.send(dataOut);
            };
            var fetcher = new  $rdf.Fetcher(targetKB, 10000, true);
            targetKB.query(query, onBindings, fetcher, onDone);


        break;

    case 'application/sparql-update':
        try { // Must parse relative to document's base address but patch doc should get diff URI
            logging.log("parsing patch ...");
            patchObject = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
        } catch(e) {
            return res.status(400).send("Patch format syntax error:\n" + e + '\n');
        }
        logging.log("reading target file ...");

        if (true) {  /// USe synchronous style to prevent interruption
            var dataIn;
            try {
                dataIn = fs.readFileSync(filename, { encoding: 'utf8'});
            } catch (err) {
                return res.status(404).send("Patch: Original file read error:" + err + '\n');
            }
            logging.log("File read OK "+dataIn.length);
            try {
                logging.log("parsing target file ...");
                $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
                logging.log("Target parsed OK ");
            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }

            // logging.log("Pre check ");
            // targetKB.check(); // @@
            var target = patchKB.sym(targetURI);
            logging.log("Target parsed OK, patching... ");

            targetKB.applyPatch(patchObject, target, function(err){
                if (err) {
                    return fail(409, err); // HTTP inconsistency error -- very important.
                }
                logging.log("Patched. Writeback URI base " + targetURI);
                var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                // logging.log("Writeback data: " + data);
                try {
                    fs.writeFileSync(filename, data, { encoding: 'utf8'});
                } catch (er) {
                    return fail(500, "Failed to write file back after patch: "+ err);
                }
                logging.log("Patch applied OK (sync)");
                res.send("Patch applied OK\n");
                if (options.live) {
                    publishDelta(req, res, patchKB, targetURI);
                }
                return;
            });

        } else { // Assync

            fs.readFile(filename, { encoding: 'utf8'}, function (err,data) {
                if (err) {
                    return res.status(404).send("Patch: Original file read error:" + err + '\n');
                }
                logging.log("File read OK "+data.length);
                try {
                    logging.log("parsing target file ...");
                    $rdf.parse(data, targetKB, targetURI, targetContentType);
                    logging.log("Target parsed OK ");

                } catch(e) {
                    return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
                }

                var target = patchKB.sym(targetURI);

                var writeFileBack = function() {
                    // logging.log("Accumulated namespaces:" + targetKB.namespaces)
                    logging.log("Writeback URI base " + targetURI);
                    var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                    // logging.log("Writeback data: " + data);

                    fs.writeFile(filename, data, { encoding: 'utf8'}, function(err){
                        if (err) {
                            return fail(500, "Failed to write file back after patch: "+ err);
                        }
                        logging.log("Patch applied OK");
                        res.send("Patch applied OK\n");
                        if (options.live) {
                            publishDelta(req, res, patchKB, targetURI);
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
}; // postOrPatch

