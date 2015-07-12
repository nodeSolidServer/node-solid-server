#!/bin/env node

var fs = require('fs');
var path = require('path');

var argv = require('nomnom')
  .script('ldnode')
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
  .option('uri', {
    abbr: 'u',
    help: 'Default address of the server (e.g. http[s]://host:port/path)'
  })
  .option('base', {
    abbr: 'b',
    full: 'base',
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
  .option('key', {
    help: 'Path to the ssl key',
    abbr: 'K',
    full: 'key'
  })
  .option('cert', {
    full: 'cert',
    help: 'Path to the ssl cert',
    abbr: 'C'
  })
  .option('webid', {
    help: 'Enable WebID+TLS authentication',
    full: 'webid',
    flag: true
  })
  .option('secret', {
    help: 'HTTP Session secret key (e.g. "your secret phrase")',
    abbr: 's'
  })
  .option('noLive', {
    full: 'no-live',
    help: 'Disable live support through WebSockets',
    flag: true
  })
  .option('suffixAcl', {
    full: 'suffix-acl',
    help: 'Suffix for acl files (default: \'.acl\')',
    abbr: 'sA'
  })
  .option('suffixChanges', {
    full: 'suffix-changes',
    help: 'Suffix for acl files (default: \'.changes\')',
    abbr: 'sC'
  })
  .option('suffixSSE', {
    full: 'suffix-sse',
    help: 'Suffix for SSE files (default: \'.events\')',
    abbr: 'sE'
  })
  .parse();

// Print version and leave
if (argv.version) {
  return;
}

// Set up --no-*
argv.live = !argv.noLive;

// Set up debug environment
process.env.DEBUG = argv.verbose ? 'ldnode:*' : false;
var debug = require('../logging').server;

// Set up port
argv.port = argv.port || 3456;

// Signal handling (e.g. CTRL+C)
if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function() {
        debug("LDP stopped.");
        process.exit();
    });
}

// Finally starting ldnode
var ldnode = require('../index');
var app = ldnode.createServer(argv);
app.listen(argv.port, function() {
    debug('LDP started on port ' + argv.port);
});

