var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib')

var subscription = require('../subscription.js')
var options = require('../options.js')
var logging = require('../logging.js')

module.exports.handler = function(req, res) {
    logging.log('\nPOST ' +req.path);
    logging.log(' text length: ' + (req.text ? req.text.length : 'undefined2'));
    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = uriToFilename(req.path);
    patchType = req.get('content-type');
    fileType = mime.lookup(filename);
    patchContentType = req.get('content-type');
    patchContentType = patchContentType.split(';')[0].trim(); // Ignore parameters
    targetContentType = mime.lookup(filename);
    var targetURI = options.prePathSlash + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the patch ending up in the same place
    logging.log("Patch Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KB as its URI is the same !

    var fail = function(status, message) {
        logging.log("FAIL "+status+ " " + message);
        return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
    }
    switch(patchContentType) {
        case 'application/sparql-update':
            try { // Must parse relative to document's base address but patch doc should get diff URI
                logging.log("parsing patch ...");
                var patch = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
            } catch(e) {
                return res.status(400).send("Patch format syntax error:\n" + e + '\n');
            }
            logging.log("reading target file ...");
            fs.readFile(filename, 'utf8', function (err,data) {
                if (err) {
                    return res.status(404).send("Patch: Original file read error:" +
                            err + '\n');
                }
                logging.log("File read OK "+data.length);
                try {
                    logging.log("parsing target file ...");
                    $rdf.parse(data, targetKB, targetURI, targetContentType);
                    logging.log("Target parsed OK ");

                } catch(e) {
                    return res.status(500).send("Patch: Target " +
                            targetContentType + " file syntax error:" + e);
                }

                var target = patchKB.sym(targetURI);

                var writeFileBack = function() {
                    logging.log("Accumulated namespaces:" + targetKB.namespaces);
                    logging.log("Writeback URI base " + targetURI);
                    var data = $rdf.serialize(target, targetKB, targetURI,
                            targetContentType);
                    fs.writeFile(filename, data, 'utf8', function(err){
                        if (err) {
                            return fail(500,
                                    "Failed to write file back after patch: " + err);
                        } else {
                            logging.log("Patch applied OK");
                            res.send("Patch applied OK\n");
                            return subscription.publishDelta(req, res,
                                    patchKB, targetURI);
                        };
                    }); // end write done
                };
                targetKB.applyPatch(patch, target, function(err){
                    if (err) {
                        return fail(409, err); // HTTP inconsistency error -- very important.
                    } else {
                        writeFileBack();
                    };
                });

            }); // end read file done
            break;

        default:
            return fail(400, "Sorry unknowm patch content type: " + patchContentType)
    }; // switch content-type
}; // postOrPatch

