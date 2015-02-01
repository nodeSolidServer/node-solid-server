// Read-Write Web:  Linked Data Server

var express = require('express'); // See http://expressjs.com/guide.html
var app = express();
var responseTime = require('response-time'); // Add X-Response-Time headers
var getRawBody = require('raw-body'); // See https://github.com/stream-utils/raw-body

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
var argv = require('optimist').boolean('cors').boolean('v').argv;

if (argv.h || argv.help || argv['?']) {
    console.log([
    "usage: ldp-httpd [path] [options]",
    "",
    "options:",
    "  --uriBase          Address, port, and default path of the server. (Example: http://localhost:3000/test/)",
    "  --fileBase         Base location to serve resources. Requests whose paths do not have fileBase as a prefix will be ignored",
    "  -p                 Port to use",
    "  -v                 Log messages to console",
    "  --changesSuffix    The suffix that will be used to identify the requests that will subscribe to changes to the object requested. Defaults to ,changes",
    "  --cors             Enable CORS via the 'Access-Control-Allow-Origin' header",
    "  -c                 Set cache time (in seconds). e.g. -c10 for 10 seconds.",
    "                     To disable caching, use -c-1.",
    "  --changesSuffix sss Change the URI suffix used for the URI of a change stream",
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
    process.on('SIGINT', function () {
        logging.log('\nhttp-server stopped.');
        process.exit();
    });
}

container.createRootContainer();

var router = express.Router();

// Request handlers

// Extract raw body
router.use('/*', function (req, res, next) {
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

// Add linkds headers
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
