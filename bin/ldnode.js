#!/bin/env node

var argv = require('nomnom')
  .option('verbose', {
    abbr: 'v',
    flag: true,
    help: 'Print the logs to console'
  })
  .option('version', {
    flag: true,
    help: 'Print current ldnode version',
    callback: function () {
      fs.readFile(path.resolve(__dirname, '../package.json'), 'utf-8', function(err, file) {
        console.log(JSON.parse(file).version);
      });
    }
  })
  .option('uriBase', {
    full: 'uri',
    abbr: 'u',
    metavar: 'URI',
    help: 'Default address of the server (e.g. http[s]://host:port/path)'
  })
  .option('fileBase', {
    abbr: 'b',
    metavar: 'PATH',
    full: 'path',
    help: 'Base location to serve resources'
  })
  .option('port', {
    abbr: 'p',
    help: 'Port to use'
  })
  .option('cache', {
    abbr: 'c',
    help: 'Set cache time (in seconds), 0 for no cache'
  })
  .option('noSsl', {
    help: 'Run ldnode with without ssl, so in http',
    full: 'no-ssl',
    flag: true
  })
  .option('sslKey', {
    help: 'Path to the ssl key',
    abbr: 'K',
    full: 'ssl-key'
  })
  .option('ssl-cert', {
    help: 'Path to the ssl cert',
    abbr: 'C'
  })
  .option('noWebid', {
    help: 'Path to the ssl key',
    full: 'no-webid',
    flag: true
  })
  .option('webidKey', {
    help: 'Path to the webid key',
    full: 'webid-key',
    abbr: 'k'
  })
  .option('webidCert', {
    help: 'Path to the webid cert',
    full: 'webid-cert',
    abbr: 'c'
  })
  .parse();

argv.webid = !argv.noWebid;
process.env.DEBUG = argv.verbose ? 'ldnode:*' : false;
var debug = require('../logging').server;
var ldnode = require('../index');

// Signal handling
if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function() {
        debug("LDP stopped.");
        process.exit();
    });
}

// Starting ldnode
var app = ldnode.createServer(argv);
app.listen(argv.p, function() {
    debug('LDP started on port ' + argv.p);
});

