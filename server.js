// Read-Write Web:  Linked Data Server
/*jslint node: true*/
"use strict";

var express = require('express'); // See http://expressjs.com/guide.html
var app = express();

var getRawBody = require('raw-body'); // See https://github.com/stream-utils/raw-body
var expressWs = require('express-ws')(app); //app = express app
var mime = require('mime');
var fs = require('fs');
var $rdf = require('rdflib');
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var regexp = require('node-regexp');
var redis = require('redis'); // https://github.com/tomkersten/sses-node-example

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

var acl = require('./acl.js');
var metadata = require('./metadata.js');
var options = require('./options.js');
var logging = require('./logging.js');
var container = require('./container.js');

//Request handlers
var getHandler = require('./handlers/get.js');
var postHandler = require('./handlers/post.js');
var putHandler = require('./handlers/put.js');
var deleteHandler = require('./handlers/delete.js');
var patchHandler = require('./handlers/patch.js');

// Command line handling
var argv = require('optimist').boolean('cors').boolean('v').boolean('live').argv;

if (argv.h || argv.help || argv['?']) {
    console.log([
        "usage: ldp-httpd [path] [options]",
        "",
        "options:",
        "  --uriBase          Address, port, and default path of the server. (Example: http://localhost:3000/test/)",
        "  --fileBase         Base location to serve resources. Requests whose paths do not have fileBase as a prefix will be ignored",
        "  --live            Offer and support live updates",
        "  -p                 Port to use",
        "  -v                 Log messages to console",
        "  --changesSuffix    The suffix that will be used to identify the requests that will subscribe to changes to the object requested. Defaults to ,changes",
        "  --cors             Enable CORS via the 'Access-Control-Allow-Origin' header",
        "  -c                 Set cache time (in seconds). e.g. -c10 for 10 seconds.",
        "                     To disable caching, use -c-1.",
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

// Initialize options
options.init(argv);

// Signal handling
if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function() {
        logging.log('http-server stopped.');
        process.exit();
    });
}

container.createRootContainer();

var router = express.Router();

// Request handlers

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
app.ws('/', function(socket, res) { // https://github.com/HenningM/express-ws
    logging.log("    WEB SOCKET incoming on " + socket.path);
    socket.on('message', function(msg) {
        console.log("Web socket message = " + msg);
        // subscribeToChanges(socket, res);
    });
});

//TODO proxy filter
if (options.xssProxy) {
    var request = require('request');
    // https://www.npmjs.com/package/request
    logging.log('XSS Proxy listening to ' + (options.proxyFilter));
    app.get(options.proxyFilter, function(req, res) {
        logging.log('originalUrl: ' + req.originalUrl);
        var uri = req.query.uri;
        if (!uri) {
            return res.status(400).send("Proxy has no uri param ");
        }
        logging.log('Proxy destination URI: ' + uri);
        request.get(uri).pipe(res);
    });
}

/*
process.on('uncaughtException', function(err) {
    // handle the error anyway -- continuing is generally dangerous
    console.log('Otherwise uncaught server exception: ' +err + '; stack: ' +err.stack);
    process.exit(1);
});
*/

// Extract raw body
router.use('/*', function(req, res, next) {
    getRawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
    }, function(err, string) {
        if (err) {
            return next(err);
        }
        req.text = string;
        next();
    });
});

// Add links headers
router.use(metadata.linksHandler);

// Add response time
router.use(responseTime());

router.use(acl.aclHandler);

// HTTP methods handlers
router.get('/*', getHandler.handler);
router.head('/*', getHandler.headHandler);
router.put('/*', putHandler.handler);
router.delete('/*', deleteHandler.handler);
router.post('/*', postHandler.handler);
router.patch('/*', patchHandler.handler);

app.use(options.pathStart, router);

//Start server
var server = app.listen(options.port, function() {
    logging.log('Listening on port %d', server.address().port);
});
