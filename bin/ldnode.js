var fs = require('fs');
var ldnode = require('../index');
var express = require('express');
var session = require('express-session');
var options = require('../options.js');
var logging = require('../logging.js');

var argv = require('optimist')
  .boolean('cors')
  .boolean('v')
  .boolean('live')
  .argv;

if (argv.h || argv.help || argv['?']) {
    console.log([
        "usage: ldnode [path] [options]",
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
        "  --webid            Enable WebID authentication",
        "  --privateKey       Path to the private key used to enable webid authentication",
        "  --cert             Path to the private key used to enable webid authentication",
        "  -h --help          Print this list and exit."
    ].join('\n'));
    process.exit();
}

// Initialize options
options.init(argv);

// Command line handling
// Signal handling
if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function() {
        logging.log("Server -- http-server stopped.");
        process.exit();
    });
}

var app = express();
app.use(session({
  secret: 'node-ldp',
  saveUninitialized: false,
  resave: false
}));

ldnode(app, options)

if (options.webid) {
  try {
    var key = fs.readFileSync(options.privateKey);
    var cert = fs.readFileSync(options.cert);
  } catch (err) {
    logging.log("Server -- Error reading private key or certificate: " + err);
    process.exit(1);
  }

  var credentials = {
    key: key,
    cert: cert,
    requestCert: true
  };
  logging.log("Server -- Private Key: " + credentials.key);
  logging.log("Server -- Certificate: " + credentials.cert);
  https.createServer(credentials, app).listen(options.port);
} else {
  app.listen(options.port);
}

logging.log("Server -- Listening on port " + options.port);

