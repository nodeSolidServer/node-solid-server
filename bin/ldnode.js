#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
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
      fs.readFile(path.resolve(__dirname, '../package.json'), 'utf-8', function (_, file) {
        console.log(JSON.parse(file).version)
      })
    }
  })
  .option('mount', {
    abbr: 'm',
    help: "Relative URL from which to serve the Linked Data Platform (default: '/')"
  })
  .option('root', {
    abbr: 'r',
    help: 'Root location on the filesystem to serve resources'
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
    help: 'Path to the ssl key file',
    abbr: 'K',
    full: 'key'
  })
  .option('cert', {
    full: 'cert',
    help: 'Path to the ssl cert file',
    abbr: 'C'
  })
  .option('webid', {
    help: 'Enable WebID+TLS authentication',
    full: 'webid',
    flag: true
  })
  .option('idp', {
    help: 'Allow registration of WebIDs',
    abbr: 'idp',
    full: 'identity-provider',
    flag: true
  })
  .option('secret', {
    help: 'HTTP Session cookie secret key (e.g. "your secret phrase")',
    abbr: 's'
  })
  .option('forceUser', {
    help: 'Force a WebID to always be logged in (useful when offline)',
    abbr: 'fU',
    full: 'force-user'
  })
  .option('proxy', {
    full: 'proxy',
    help: 'Use a proxy on example.tld/proxyPath',
    abbr: 'P'
  })
  .option('noLive', {
    full: 'no-live',
    help: 'Disable live support through WebSockets',
    flag: true
  })
  .option('suffixAcl', {
    full: 'suffix-acl',
    help: "Suffix for acl files (default: '.acl')",
    abbr: 'sA'
  })
  .option('suffixMeta', {
    full: 'suffix-meta',
    help: "Suffix for metadata files (default: '.meta')",
    abbr: 'sM'
  })
  .option('noErrorPages', {
    full: 'no-error-pages',
    flag: true,
    help: 'Disable custom error pages (use Node.js default pages instead)'
  })
  .option('errorPages', {
    full: 'error-pages',
    help: 'Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)'
  })
  .option('defaultApp', {
    full: 'default-app',
    help: 'URI to use as a default app for resources (default: https://linkeddata.github.io/warp/#/list/)'
  })
  .parse()

function bin (argv) {
  // Print version and leave
  if (argv.version) {
    return 0
  }

  // Set up --no-*
  argv.live = !argv.noLive

  // Set up debug environment
  process.env.DEBUG = argv.verbose ? 'ldnode:*' : false
  var debug = require('../lib/debug').server

  // Set up port
  argv.port = argv.port || 3456

  // Signal handling (e.g. CTRL+C)
  if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function () {
      debug('LDP stopped.')
      process.exit()
    })
  }

  // Finally starting ldnode
  var ldnode = require('../')
  var app
  try {
    app = ldnode.createServer(argv)
  } catch (e) {
    if (e.code === 'EACCES') {
      console.log('You need root privileges to start on this port')
      return 1
    }
    if (e.code === 'EADDRINUSE') {
      console.log('The port ' + argv.port + ' is already in use')
      return 1
    }
    console.log(e.message)
    console.log(e.stack)
    return 1
  }
  app.listen(argv.port, function () {
    debug('LDP started on port ' + argv.port)
  })
}

bin(argv)
