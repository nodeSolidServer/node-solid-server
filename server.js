// Read-Write Web:  Linked Data Server
//
"use strict";

var express = require('express'); // See http://expressjs.com/guide.html
var app = express();

var expressWs = require('express-ws')(app); //app = express app
var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var regexp = require('node-regexp');

var redis   = require('redis'); // https://github.com/tomkersten/sses-node-example




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

var argv = require('optimist').boolean('cors').boolean('v').boolean('live').argv;

if (argv.h || argv.help || argv['?']) {
  console.log([
    "usage: ldp-httpd [path] [options]",
    "",
    "options:",
    "  -p                Port to use [3000]",
    "  -a                Address to use [0.0.0.0]",
//    "  -d                 Show directory listings [true]",
//    "  -i                 Display autoIndex [true]",
//    "  -e --ext           Default file extension if none supplied [none]",
    "  -v                log messages to console",
    "  --live            Offer and support live updates",
    "  --cors            Enable CORS via the 'Access-Control-Allow-Origin' header",
//    "  -o                 Open browser window after starting the server",
    "  -c                Set cache time (in seconds). e.g. -c10 for 10 seconds.",
    "                    To disable caching, use -c-1.",
    "  --changesSuffix sss Change the URI suffix used for the URI of a change stream",
    "  --SSESuffix sss   Change the URI suffix used for the URI of a SSE stream",
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
    fileBase:   argv.fileBase || process.env.FILEBASE || process.cwd() + '/test/',
    address: argv.a || '0.0.0.0',
    port:  parseInt(argv.p || process.env.PORT ||  3000, 10),
    verbose: argv.v,
    xssProxy: argv.xssProxy,
    live: argv.live,
    changesSuffix: argv.changesSuffix || ',changes',
    SSESuffix: argv.SSESuffix || ',events',
    ssl: argv.S,
    cors: argv.cors,
    leavePatchConnectionOpen: false
};


var formatDateTime = function(date, format) {
    return format.split('{').map(function(s){
        var k = s.split('}')[0];
        var width = {'Milliseconds':3, 'FullYear':4};  
        var d = {'Month': 1};                  
        return s?  ( '000' + (date['get' + k]() + (d[k]|| 0))).slice(-(width[k]||2)) + s.split('}')[1] : '';
    }).join('');
};

var timestamp = function() {
    return formatDateTime(new Date(), '{FullYear}-{Month}-{Date}T{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
}
var shortTime = function() {
    return formatDateTime(new Date(), '{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
}
var consoleLog = function(message) {
    if (options.verbose) {
//        console.log.apply(console, arguments); // was arguments
        console.log(timestamp() + ' ' + message ); // was arguments
    }
};

var subscriptions = {}; // Map URI to array of watchers

consoleLog("   uriBase: " + options.uriBase);
options.pathStart = '/' + options.uriBase.split('//')[1].split('/').slice(1).join('/');
options.prePathSlash =  options.uriBase.split('/').slice(0,3).join('/');
consoleLog("URI pathStart: " + options.pathStart);
options.pathFilter = regexp().start(options.pathStart).toRegExp();
options.proxyFilter = regexp().start(options.xssProxy).toRegExp();
consoleLog("URI path filter regexp: " + options.pathFilter);


consoleLog("Verbose: "+options.verbose);
consoleLog("Live: "+options.live);

if (process.platform !== 'win32') {
  //
  // Signal handlers don't work on Windows.
  //
  process.on('SIGINT', function () {
    consoleLog('http-server stopped.');
    process.exit();
  });
}


var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

var uriToFilename = function(uri) {
    if (uri.slice(0, options.pathStart.length) !== options.pathStart) {
        throw "Path '"+uri+"'not starting with base '" + options.pathStart +"'.";
    }
    var filename = options.fileBase + uri.slice(options.pathStart.length);
    // consoleLog(' -- filename ' +filename);
    return filename;    
};


var getRawBody = require('raw-body'); // See https://github.com/stream-utils/raw-body
app.use(function (req, res, next) {
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




var postOrPatch = function(req, res) {
    consoleLog('\nPOST ' +req.path);
    consoleLog(' text length: ' + (req.text ? req.text.length : 'undefined2'));
    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = uriToFilename(req.path);
    var patchContentType = req.get('content-type').split(';')[0].trim(); // Ignore parameters
    var targetContentType = mime.lookup(filename);
    var targetURI = options.prePathSlash + req.path;
    var patchURI = targetURI ;  // @@@ beware the triples from the patch ending up in the same place
    consoleLog("Patch Content-type " + patchContentType + " patching target " + targetContentType + " <" + targetURI + '>');
    var targetKB = $rdf.graph();
    var patchKB = $rdf.graph(); // Keep the patch in a sep KB as its URI is the same ! 
    var patchObject;
    var fail = function(status, message) {
        consoleLog("FAIL "+status+ " " + message);
        return res.status(status).send('<html><body>\n'+ message+ '\n</body></html>\n');
    };
    switch(patchContentType) {
    case 'application/sparql-update':
        try { // Must parse relative to document's base address but patch doc should get diff URI
            consoleLog("parsing patch ...");
            patchObject = $rdf.sparqlUpdateParser(req.text, patchKB, patchURI);
        } catch(e) {
            return res.status(400).send("Patch format syntax error:\n" + e + '\n'); 
        }
        consoleLog("reading target file ...");

        if (true) {  /// USe synchronous style to prevent interruption
            var dataIn;
            try {
                dataIn = fs.readFileSync(filename, { encoding: 'utf8'});
            } catch (err) {
                return res.status(404).send("Patch: Original file read error:" + err + '\n');
            }
            consoleLog("File read OK "+dataIn.length);
            try {
                consoleLog("parsing target file ...");
                $rdf.parse(dataIn, targetKB, targetURI, targetContentType);
                consoleLog("Target parsed OK ");
            } catch(e) {
                return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
            }
                
            // consoleLog("Pre check ");
            // targetKB.check(); // @@
            var target = patchKB.sym(targetURI);
            consoleLog("Target parsed OK, patching... ");
                
            targetKB.applyPatch(patchObject, target, function(err){
                if (err) {
                    return fail(409, err); // HTTP inconsistency error -- very important.
                };
                consoleLog("Patched. Writeback URI base " + targetURI);
                var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                // consoleLog("Writeback data: " + data);
                try {
                    fs.writeFileSync(filename, data, { encoding: 'utf8'});
                } catch (er) {
                    return fail(500, "Failed to write file back after patch: "+ err);
                };
                consoleLog("Patch applied OK (sync)");
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
                consoleLog("File read OK "+data.length);
                try {
                    consoleLog("parsing target file ...");
                    $rdf.parse(data, targetKB, targetURI, targetContentType);
                    consoleLog("Target parsed OK ");

                } catch(e) {
                    return res.status(500).send("Patch: Target " + targetContentType + " file syntax error:" + e);
                }
                
                var target = patchKB.sym(targetURI);
                
                var writeFileBack = function() {
                    // consoleLog("Accumulated namespaces:" + targetKB.namespaces)
                    consoleLog("Writeback URI base " + targetURI);
                    var data = $rdf.serialize(target, targetKB, targetURI, targetContentType);
                    // consoleLog("Writeback data: " + data);

                    fs.writeFile(filename, data, { encoding: 'utf8'}, function(err){
                        if (err) {
                            return fail(500, "Failed to write file back after patch: "+ err);
                        }
                        consoleLog("Patch applied OK");
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
    }; // switch content-type
}; // postOrPatch


///////////////  Server side Events SSE


var SSEsubscriptions = {};

var subscribeToChanges_SSE = function(req, res) {

    var messageCount;
    console.log("Server Side Events subscription");
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',events'
    if (SSEsubscriptions[targetPath] === undefined) {
        SSEsubscriptions[targetPath] = redis.createClient();
    }
    var subscriber = SSEsubscriptions[targetPath];
    console.log("Server Side Events subscription: " + targetPath);

    subscriber.subscribe('updates');

    // In case we encounter an error...print it out to the console
    subscriber.on('error', function(err) {
        console.log("Redis Error: " + err);
    });

    // When we receive a message from the redis connection
    subscriber.on('message', function(channel, message) {
        messageCount += 1; // Increment our message count

        res.write('id: ' + messageCount + '\n');
        res.write("data: " + message + '\n\n'); // Note the extra newline
    });

    //send headers for event-stream connection
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('\n');

    // The 'close' event is fired when a user closes their browser window.
    // In that situation we want to make sure our redis channel subscription
    // is properly shut down to prevent memory leaks.
    
    req.on("close", function() {
        subscriber.unsubscribe();
        subscriber.quit();
    });
    
};

var publishDelta_SSE = function (req, res, patchKB, targetURI){
    // @@ TODO
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',changes'
    var publisherClient = SSEsubscriptions[targetPath];
    publisherClient.publish( 'updates', ('"' + targetPath + '" data changed visited') );
};

///////////////// Long poll

var DelayedResponse = require('http-delayed-response');
// try this.  https://www.npmjs.org/package/http-delayed-response


var subscribeToChangesLongPoll = function(req, res) {
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',changes'
    if (subscriptions[targetPath] === undefined) {
        subscriptions[targetPath] = [];
    }

    var delayed = new DelayedResponse(req, res);

    var subscription = { 'targetPath': targetPath,
            'request': req, 'response': res, 'delayed': delayed,
            'timestamp': timestamp() };
    subscriptions[targetPath].push(subscription);
    
    var unsubscribe = function() {
        for (var i=0; i < subscriptions[targetPath].length; i++) {
            if (subscriptions[targetPath][i] === subscription) {
                subscriptions[targetPath] = subscriptions[targetPath].splice(i, 1);
                consoleLog("UNSUBSCRIBED " + targetPath + " now " + subscriptions[targetPath].length);
                return;
            }
        }
        consoleLog("ERROR - COULD NOT FIND SUB of " + subscription.timestamp +
            " for " + targetPath + " now " + subscriptions[targetPath].length);

    }

    delayed.on('error', function(e) {
        consoleLog("DeleyaedResponse error " + e);
        unsubscribe();
    });
    delayed.on('done', function(e) {
        consoleLog("DeleyaedResponse done " + e);
        unsubscribe();
    });
    delayed.on('abort', function(e) {// eg the other end disconnected
        consoleLog("DeleyaedResponse abort " + e);
        unsubscribe();
    });
    delayed.on('cancel', function(e) {
        consoleLog("DeleyaedResponse cancel " + e);
        unsubscribe();
    });
    delayed.wait();
    //slowFunction(delayed.wait());
    res.set('content-type', 'text/n3');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    // was: res.setTimeout
    req.socket.setTimeout(0); // Disable timeout (does this work??)
    
    consoleLog("LONG POLL : Now " + subscriptions[targetPath].length +  " subscriptions for " +  targetPath);

};

// Find the patch operation itself withing a patch graph
var patchOperation = function(patchKB) {
    // consoleLog("PatchKb = " + patchKB.statements.map(function(st){return st.toNT()})) 
    var sts = patchKB.statementsMatching(undefined, PATCH('insert'), undefined, undefined)
        .concat(patchKB.statementsMatching(undefined, PATCH('delete'), undefined, undefined));
    return sts.length ? sts[0].subject : null;
}

var publishDelta = function (req, res, patchKB, targetURI){

    var operation = patchOperation(patchKB);
    if (!operation) {
        consoleLog("Dummy patch, no opreration. Publish aborted.");
        return;
    }
    patchKB.add(operation, PATCH('logged'), new Date()); // @@ also add user 
    var patchData = $rdf.serialize(undefined, patchKB, targetURI, 'text/n3');
    
    consoleLog("Distributing change to " + req.path + ", patch is: " );
    consoleLog("<<<<<" + patchData + ">>>>>\n");

    publishDelta_LongPoll(req, res, patchData, targetURI);

};

var publishDelta_LongPoll = function (req, res, patchData, targetURI){
    consoleLog("    Long poll change subscription count " + (subscriptions[req.path] || []).length);
    if (! subscriptions[req.path]) return; 
    subscriptions[req.path].map(function(subscription){
        consoleLog("    Long poll change to " + req.path);
        if (options.leavePatchConnectionOpen) {
            subscription.response.write(patchData);
        } else {
            // consoleLog("    --- headersSent 2  " + res.headersSent);
            subscription.response.write(patchData);
            subscription.response.end();
        };    
    });

    subscriptions[req.path] = []; // one-off polll
    consoleLog("LONG POLL : Now NO subscriptions for " +  targetURI);
}


app.use(responseTime());


//////////////////// Request handlers:

app.mountpath = ''; //  needs to be set for addSocketRoute aka .ws()
//consoleLog("App mountpath: " + app.mountpath);
/*
app.ws('/echo', function(ws, req) {
  ws.on('message', function(msg) {
    ws.send(msg);
  });
});
*/

// was options.pathFilter
app.ws('/', function(socket, res) {   // https://github.com/HenningM/express-ws
    consoleLog("    WEB SOCKET incoming on " + socket.path);
    socket.on('message', function(msg) {
        console.log("Web socket message = "+msg);
        // subscribeToChanges(socket, res);
    });
});

if (options.xssProxy) {
    var request = require('request');
    // https://www.npmjs.com/package/request
    consoleLog('XSS Proxy listening to ' + (options.proxyFilter))
    app.get(options.proxyFilter, function(req, res) {
        var uri1 = req.path.indexOf('uri=');
        if (!uri1) {
            return res.status(400).send("Proxy has not uri param ");
        }
        var uri = decodeURIComponent(req.path.slice(uri1 + 4));
        consoleLog('Proxy URI: ' + uri)
        request.get(uri).pipe(res);
    });
};



app.get(options.pathFilter, function(req, res){

    if (('' +req.path).slice(- options.changesSuffix.length) === options.changesSuffix) 
        return subscribeToChangesLongPoll(req, res);
    if (('' +req.path).slice(- options.SSESuffix.length) === options.SSESuffix) 
        return subscribeToChanges_SSE(req, res);
        
    res.header('MS-Author-Via' , 'SPARQL' );
    if (options.live) {
        // Note not yet in http://www.iana.org/assignments/link-relations/link-relations.xhtml
        res.header('Link' , '' + req.path + options.changesSuffix + ' ; rel=changes' );
        // res.header('Link' , '' + req.path + options.SSESuffix + ' ; rel=events' );  overwrites the pevious
        res.header('Updates-Via' , '' + req.path + options.changesSuffix );
    };
    consoleLog('GET -- ' +req.path);
    var filename = uriToFilename(req.path);
    fs.readFile(filename, function(err, data) {
        if (err) {
            consoleLog(' -- read ERROR ' + err);
            res.status(404).send("Can't read file: "+ err)
        } else {
            var ct = mime.lookup(filename);
            res.set('content-type', ct)
            res.send(data);
            consoleLog(' -> GET ' + req.path + ' sent ' + data.length +' bytes of ' + ct);
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
    consoleLog('\nDELETE ' +req.path);
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

/*
process.on('uncaughtException', function(err) {
    // handle the error anyway -- continuing is generally dangerous
    console.log('Otherwise uncaught server exception: ' +err + '; stack: ' +err.stack);
    process.exit(1);
});
*/

var server = app.listen(options.port, function() {
    consoleLog('Listening on port' + server.address().port);
});


