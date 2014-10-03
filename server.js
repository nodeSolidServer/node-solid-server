

//  See http://stackoverflow.com/questions/1911015/how-to-debug-node-js-applications

// iff debug
//var agent = require('webkit-devtools-agent')
//agent.start()

/* Install to your application, npm install webkit-devtools-agent
Include in your application, agent = require('webkit-devtools-agent')
Activate the agent: kill -SIGUSR2 <your node process id>
Access the agent via the appropriate link
*/

// See http://expressjs.com/guide.html

var express = require('express');
var app = express();

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib.js')
var responseTime = require('response-time'); // Add X-Response-Time headers

// Should be command line params:

var uriBase = '/test/' // @@
var fileBase = '/devel/github.com/linkeddata/node-ldp-httpd/test/'; //@@

var uriFilter = /\/test\/.*/

var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

var uriToFilename = function(uri) {
    if (uri.slice(0, uriBase.length) !== uriBase) {
        throw "URI not starting with base: " + uriBase;
    }
    var filename = fileBase + uri.slice(uriBase.length);
    console.log(' -- filename ' +filename);
    return filename    
};


// See https://github.com/stream-utils/raw-body
var getRawBody = require('raw-body')
//var typer      = require('media-typer')
app.use(function (req, res, next) {
    getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
    }, function (err, string) {
    if (err) {
        return next(err)
    }
    req.text = string
    next()
  })
});



app.get(uriFilter, function(req, res){
    console.log('GET -- ' +req.path);
    var filename = uriToFilename(req.path);
    fs.readFile(filename, function(err, data) {
        if (err) {
            console.log(' -- read error ' + err);
            res.status(404).send("Can't read file: "+ err)
        } else {
            console.log(' -- read Ok ' + data.length);
            ct = mime.lookup(filename);
            res.set('content-type', ct)
            console.log(' -- content-type ' + ct);
            res.send(data);
        };
    });
});

app.put(uriFilter, function(req, res){
    console.log('PUT ' +req.path);
    console.log(' text length:' + (req.text ? req.text.length : 'undefined1'))
    var filename = uriToFilename(req.path);
    ct1 = req.get('content-type');
    ct2 = mime.lookup(filename);
    if (ct1 && ct2 && (ct1 !== ct2)) {
        res.status(415).send("Content type mismatch with path file.extenstion");
    }
    if (!ct2) { // @@ Later, add the extension or track metadata
        res.status(415).send("Sorry, Filename must have extension for content type");
    }
    fs.writeFile(filename, req.text,  function(err) {
        if (err) {
            console.log(' -- write error ' + err);
            return res.status(500).send("Can't write file: "+ err);
        } else {
            console.log(' -- write Ok ' + req.text.length);
            res.send();
        }
    }); // file write
});


applySparqlPatch = function() {
  // write me
}

app.use(responseTime());

app.post(uriFilter, function(req, res){
    console.log('\nPOST ' +req.path);
    console.log(' text length: ' + (req.text ? req.text.length : 'undefined2'))
    var filename = uriToFilename(req.path);
    patchType = req.get('content-type');
    fileType = mime.lookup(filename);
    patchContentType = req.get('content-type');
    targetContentType = mime.lookup(filename);
    var targetURI = 'https://' + req.hostname + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the pacth ending up in the same place
    console.log('Content-type ' + patchContentType + " patching <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KBas its URI is the same ! 

    var fail = function(status, message) {
        console.log("FAIL "+status+ " " + message);
        return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
    }
    switch(patchContentType) {
    case 'application/sparql-update':
        try { // Must parse relative to document's base address but patch doc should get diff URI
            console.log("parsing patch ...")
            var patch = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
        } catch(e) {
            return res.status(400).send("Patch format syntax error:\n" + e + '\n'); 
        }
        console.log("reading target file ...")
        fs.readFile(filename, 'utf8', function (err,data) {
            if (err) {
                return res.status(404).send("Patch: Original file read error:" + err + '\n');
            }
            console.log("File read OK "+data.length);
            try {
                console.log("parsing target file ...")
                $rdf.parse(data, targetKB, targetURI, targetContentType);
                console.log("Target parsed OK ");

            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }
            
            var target = patchKB.sym(targetURI);
            
            
            var writeFileBack = function() {
                console.log("Writeback ");
                var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                // console.log("Writeback data: " + data);

                fs.writeFile(filename, data, 'utf8', function(err){
                    if (err) {
                        return fail(500, "Failed to write file back after patch: "+ err);
                    } else {
                        console.log("Patch applied OK");
                        return res.send("Patch applied OK\n");
                    };
                }); // end write done
            };
            

            var doPatch = function() {
                console.log("doPatch ...")
                
                if (patch['delete']) {
                    console.log("doPatch delete "+patch['delete'])
                    var ds =  patch['delete']
                    if (bindings) ds = ds.substitute(bindings);
                    ds = ds.statements;
                    var bad = [];
                    var ds2 = ds.map(function(st){ // Find the actual statemnts in the store
                        var sts = targetKB.statementsMatching(st.subject, st.predicate, st.object, target);
                        if (sts.length === 0) {
                            console.log("NOT FOUND deletable " + st);
                            bad.push(st);
                        } else {
                            console.log("Found deletable " + st);
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
                    console.log("doPatch insert "+patch['insert'])
                    var ds =  patch['insert'];
                    if (bindings) ds = ds.substitute(bindings);
                    ds = ds.statements;
                    ds.map(function(st){st.why = target;
                        console.log("Adding: " + st);
                        targetKB.add(st.subject, st.predicate, st.object, st.why)});
                };
                writeFileBack();
            };

            var bindings = null;
            if (patch.where) {
                console.log("Processing WHERE: " + patch.where + '\n');

                var query = new $rdf.Query('patch');
                query.pat = patch.where;
                query.pat.statements.map(function(st){st.why = target});

                var bindingsFound = [];
                console.log("Processing WHERE - launching query: " + query.pat);

                targetKB.query(query, function onBinding(binding) {
                    bindingsFound.push(binding)
                },
                targetKB.fetcher,
                function onDone() {
                    if (bindingsFound.length == 0) {
                        return fail(409, "No match found to be patched:" + patch.where);
                    }
                    if (bindingsFound.length > 1) {
                        return fail(409, "Patch ambiguous. No patch done.");
                    }
                    bindings = bindingsFound[0];
                    doPatch();
                }
                );

            } else {
                doPatch()
            };
            
         }); // end read done
            
        break;
    };

});

app.patch(uriFilter, function(req, res){
  res.send('Hello World');
});

var server = app.listen(3000, function() {
    console.log('Listening on port %d', server.address().port);
});

