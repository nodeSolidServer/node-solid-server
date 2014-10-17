// Read-Write Web:  Linked Data Server
//


var express = require('express'); // See http://expressjs.com/guide.html
var app = express();

var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib.js')
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var regexp = require('node-regexp');




// Debugging:
//  See http://stackoverflow.com/questions/1911015/how-to-debug-node-js-applications
// iff debug
//var agent = require('webkit-devtools-agent')
//agent.start()

/* Install to your application, npm install webkit-devtools-agent
Include in your application, agent = require('webkit-devtools-agent')
Activate the agent: kill -SIGUSR2 <your node process id>
Access the agent via the appropriate link
*/


/////////////////////////////////////////// ArgV handling ripped from http-server/bin/http-server

var argv = require('optimist').boolean('cors').boolean('v').argv;

if (argv.h || argv.help || argv['?']) {
  console.log([
    "usage: ldp-httpd [path] [options]",
    "",
    "options:",
    "  -p                 Port to use [3000]",
    "  -a                 Address to use [0.0.0.0]",
//    "  -d                 Show directory listings [true]",
//    "  -i                 Display autoIndex [true]",
//    "  -e --ext           Default file extension if none supplied [none]",
    "  -v               log messages to console",
    "  --cors             Enable CORS via the 'Access-Control-Allow-Origin' header",
//    "  -o                 Open browser window after starting the server",
    "  -c                 Set cache time (in seconds). e.g. -c10 for 10 seconds.",
    "                     To disable caching, use -c-1.",
    "",
    "  -S --ssl           Enable https.",
    "  -C --cert          Path to ssl cert file (default: cert.pem).",
    "  -K --key           Path to ssl key file (default: key.pem).",
    "",
    "  -h --help          Print this list and exit."
  ].join('\n'));
  process.exit();
}

var options = {
    aclSuffix:  argv.aclSuffix || process.env.ACLSUFFIX  || ",acl",
    uriBase:    argv.uriBase || process.env.URIBASE || 'http://localhost:3000'+process.cwd() + '/test/',
    fileBase:   argv.fileBase || procss.env.FILEBASE || process.cwd() + '/test/',
    address: argv.a || '0.0.0.0',
    port:  parseInt(argv.p || process.env.PORT ||  3000),
    verbose: argv.v,
    ssl: argv.S,
    cors: argv.cors
};


var consoleLog = function() {
    if (options.verbose) console.log.apply(console, arguments);
}


consoleLog("   uriBase: " + options.uriBase);
options.pathStart = '/' + options.uriBase.split('//')[1].split('/').slice(1).join('/');
consoleLog("URI pathStart: " + options.pathStart);
options.pathFilter = regexp().start(options.pathStart).toRegExp();
consoleLog("URI path filter regexp: " + options.pathFilter);


consoleLog("Verbose: "+options.verbose);

if (process.platform !== 'win32') {
  //
  // Signal handlers don't work on Windows.
  //
  process.on('SIGINT', function () {
    consoleLog('http-server stopped.');
    process.exit();
  });
};


var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

var uriToFilename = function(uri) {
    if (uri.slice(0, options.pathStart.length) !== options.pathStart) {
        throw "Path '"+uri+"'not starting with base '" + options.pathStart +"'.";
    }
    var filename = options.fileBase + uri.slice(options.pathStart.length);
    consoleLog(' -- filename ' +filename);
    return filename    
};


var getRawBody = require('raw-body'); // See https://github.com/stream-utils/raw-body
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




var postOrPatch = function(req, res) {
    consoleLog('\nPOST ' +req.path);
    consoleLog(' text length: ' + (req.text ? req.text.length : 'undefined2'))
    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = uriToFilename(req.path);
    patchType = req.get('content-type');
    fileType = mime.lookup(filename);
    patchContentType = req.get('content-type');
    patchContentType = patchContentType.split(';')[0].trim(); // Ignore parameters
    targetContentType = mime.lookup(filename);
    var targetURI = 'https://' + req.hostname + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the pacth ending up in the same place
    consoleLog("Patch Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KBas its URI is the same ! 

    var fail = function(status, message) {
        consoleLog("FAIL "+status+ " " + message);
        return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
    }
    switch(patchContentType) {
    case 'application/sparql-update':
        try { // Must parse relative to document's base address but patch doc should get diff URI
            consoleLog("parsing patch ...")
            var patch = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
        } catch(e) {
            return res.status(400).send("Patch format syntax error:\n" + e + '\n'); 
        }
        consoleLog("reading target file ...")
        fs.readFile(filename, 'utf8', function (err,data) {
            if (err) {
                return res.status(404).send("Patch: Original file read error:" + err + '\n');
            }
            consoleLog("File read OK "+data.length);
            try {
                consoleLog("parsing target file ...")
                $rdf.parse(data, targetKB, targetURI, targetContentType);
                consoleLog("Target parsed OK ");

            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }
            
            var target = patchKB.sym(targetURI);
            
            var writeFileBack = function() {
                consoleLog("Accumulated namespaces:" + targetKB.namespaces)
                consoleLog("Writeback ");
                var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                // consoleLog("Writeback data: " + data);

                fs.writeFile(filename, data, 'utf8', function(err){
                    if (err) {
                        return fail(500, "Failed to write file back after patch: "+ err);
                    } else {
                        consoleLog("Patch applied OK");
                        return res.send("Patch applied OK\n");
                    };
                }); // end write done
            };
            

            var doPatch = function() {
                consoleLog("doPatch ...")
                
                if (patch['delete']) {
                    consoleLog("doPatch delete "+patch['delete'])
                    var ds =  patch['delete']
                    if (bindings) ds = ds.substitute(bindings);
                    ds = ds.statements;
                    var bad = [];
                    var ds2 = ds.map(function(st){ // Find the actual statemnts in the store
                        var sts = targetKB.statementsMatching(st.subject, st.predicate, st.object, target);
                        if (sts.length === 0) {
                            consoleLog("NOT FOUND deletable " + st);
                            bad.push(st);
                        } else {
                            consoleLog("Found deletable " + st);
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
                    consoleLog("doPatch insert "+patch['insert'])
                    var ds =  patch['insert'];
                    if (bindings) ds = ds.substitute(bindings);
                    ds = ds.statements;
                    ds.map(function(st){st.why = target;
                        consoleLog("Adding: " + st);
                        targetKB.add(st.subject, st.predicate, st.object, st.why)});
                };
                writeFileBack();
            };

            var bindings = null;
            if (patch.where) {
                consoleLog("Processing WHERE: " + patch.where + '\n');

                var query = new $rdf.Query('patch');
                query.pat = patch.where;
                query.pat.statements.map(function(st){st.why = target});

                var bindingsFound = [];
                consoleLog("Processing WHERE - launching query: " + query.pat);

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
                });
            } else {
                doPatch()
            };
         }); // end read done            
        break;
        
    default:
        return fail(400, "Sorry unknowm patch content type: " + patchContentType)
    }; // switch content-type
}; // postOrPatch




app.use(responseTime());


//////////////////// Request handlers:

app.get(options.pathFilter, function(req, res){
    res.header('MS-Author-Via' , 'SPARQL' );
    consoleLog('GET -- ' +req.path);
    var filename = uriToFilename(req.path);
    fs.readFile(filename, function(err, data) {
        if (err) {
            consoleLog(' -- read error ' + err);
            res.status(404).send("Can't read file: "+ err)
        } else {
            consoleLog(' -- read Ok ' + data.length);
            ct = mime.lookup(filename);
            res.set('content-type', ct)
            consoleLog(' -- content-type ' + ct);
            res.send(data);
        };
    });
});

app.put(options.pathFilter, function(req, res){
    consoleLog('PUT ' +req.path);
    consoleLog(' text length:' + (req.text ? req.text.length : 'undefined1'))
    res.header('MS-Author-Via' , 'SPARQL' );
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
            consoleLog(" ### Write error: " + err);
            return res.status(500).send("Can't write file: "+ err);
        } else {
            consoleLog(" -- write Ok " + req.text.length);
            res.send();
        }
    }); // file write
});

app.delete(options.pathFilter, function(req, res){
    consoleLog('DELETE ' +req.path);
//    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = uriToFilename(req.path);
    fs.unlink(filename, function(err) {
        if (err) {
            consoleLog("   ### DELETE unlink() error: " + err);
            return res.status(404).send("Can't delete file: "+ err); // @@ best 
        } else {
            consoleLog(" -- delete Ok " + req.text.length);
            res.send();
        }
    }); // file delete
});


app.post(options.pathFilter, postOrPatch);
app.patch(options.pathFilter, postOrPatch);

var server = app.listen(options.port, function() {
    consoleLog('Listening on port %d', server.address().port);
});


