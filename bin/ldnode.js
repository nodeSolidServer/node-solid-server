#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var argv = require('nomnom')
  .script('ldnode')
  .option('root', {
    abbr: 'r',
    help: 'Root folder to serve (defaut: \'./\')'
  })
  .option('port', {
    abbr: 'p',
    help: 'Port to use'
  })
  .option('key', {
    help: 'Path to the SSL private key in PEM format',
    abbr: 'K',
    full: 'key'
  })
  .option('cert', {
    full: 'cert',
    help: 'Path to the SSL certificate key in PEM format',
    abbr: 'C'
  })
  .option('webid', {
    help: 'Enable WebID+TLS authentication',
    full: 'webid',
    flag: true
  })
  .option('idp', {
    help: 'Allow users to register their WebID on subdomains',
    abbr: 'idp',
    full: 'identity-provider',
    flag: true
  })
  .option('secret', {
    help: 'Secret used to sign the session ID cookie (e.g. "your secret phrase")',
    abbr: 's'
  })
  .option('createAdmin', {
    full: 'create-admin',
    flag: true,
    help: 'Allow a user to set up their initial identity in single-user mode'
  })
  .option('noLive', {
    full: 'no-live',
    help: 'Disable live support through WebSockets',
    flag: true
  })
  .option('proxy', {
    full: 'proxy',
    help: 'Use a proxy on example.tld/proxyPath',
    abbr: 'P'
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
  .option('mount', {
    abbr: 'm',
    help: 'Serve on a specific URL path (default: \'/\')'
  })
  .option('forceUser', {
    help: 'Force a WebID to always be logged in (useful when offline)',
    abbr: 'fU',
    full: 'force-user'
  })
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
