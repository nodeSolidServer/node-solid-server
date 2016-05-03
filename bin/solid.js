#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var argv = require('nomnom')
  .script('solid')
  .option('version', {
    flag: true,
    help: 'Print current solid version',
    callback: function () {
      fs.readFile(path.resolve(__dirname, '../package.json'), 'utf-8', function (_, file) {
        console.log(JSON.parse(file).version)
      })
    }
  })
  .option('verbose', {
    abbr: 'v',
    flag: true,
    help: 'Print the logs to console\n'
  })
  .option('root', {
    help: 'Root folder to serve (defaut: \'./\')'
  })
  .option('port', {
    help: 'Port to use'
  })
  .option('webid', {
    help: 'Enable WebID+TLS authentication (use `--no-webid` for HTTP instead of HTTPS)',
    full: 'webid',
    flag: true
  })
  .option('owner', {
    help: 'Set the owner of the storage'
  })
  .option('key', {
    help: 'Path to the SSL private key in PEM format',
    full: 'ssl-key'
  })
  .option('cert', {
    full: 'ssl-cert',
    help: 'Path to the SSL certificate key in PEM format'
  })
  .option('idp', {
    help: 'Allow users to register their WebID on subdomains\n',
    full: 'allow-signup',
    flag: true
  })
  .option('noLive', {
    full: 'no-live',
    help: 'Disable live support through WebSockets',
    flag: true
  })
  .option('defaultApp', {
    full: 'default-app',
    help: 'URI to use as a default app for resources (default: https://linkeddata.github.io/warp/#/list/)'
  })
  .option('proxy', {
    full: 'proxy',
    help: 'Use a proxy on example.tld/proxyPath'
  })
  .option('fileBrowser', {
    full: 'file-browser',
    help: 'URI to use as a default app for resources (default: https://linkeddata.github.io/warp/#/list/)'
  })
  .option('dataBrowser', {
    full: 'data-browser',
    flag: true,
    help: 'Enable viewing RDF resources using a default data browser application (e.g. mashlib)'
  })
  .option('suffixAcl', {
    full: 'suffix-acl',
    help: 'Suffix for acl files (default: \'.acl\')'
  })
  .option('suffixMeta', {
    full: 'suffix-meta',
    help: 'Suffix for metadata files (default: \'.meta\')'
  })
  .option('secret', {
    help: 'Secret used to sign the session ID cookie (e.g. "your secret phrase")',
    full: 'session-secret'
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
  .option('mount', {
    help: 'Serve on a specific URL path (default: \'/\')'
  })
  .option('forceUser', {
    help: 'Force a WebID to always be logged in (useful when offline)',
    full: 'force-user'
  })
  .option('strictOrigin', {
    help: 'Enforce same origin policy in the ACL',
    full: 'strict-origin',
    flag: true
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
  process.env.DEBUG = argv.verbose ? 'solid:*' : false
  var debug = require('../lib/debug').server

  // Set up port
  argv.port = argv.port || 3456

  // Webid to be default in command line
  if (argv.webid !== false) {
    argv.webid = true
  }

  // Signal handling (e.g. CTRL+C)
  if (process.platform !== 'win32') {
    // Signal handlers don't work on Windows.
    process.on('SIGINT', function () {
      debug('LDP stopped.')
      process.exit()
    })
  }

  if (argv.owner) {
    var rootPath = argv.root
    if (!rootPath) {
      rootPath = process.cwd()
    }
    if (!(rootPath.endsWith('/'))) {
      rootPath += '/'
    }
    rootPath += (argv.suffixAcl || '.acl')

    var defaultAcl = `@prefix n0: <http://www.w3.org/ns/auth/acl#>.
  @prefix n2: <http://xmlns.com/foaf/0.1/>.

  <#owner>
     a                 n0:Authorization;
     n0:accessTo       <./>;
     n0:agent          <${argv.owner}>;
     n0:defaultForNew  <./>;
     n0:mode           n0:Control, n0:Read, n0:Write.
  <#everyone>
     a                 n0:Authorization;
     n0:               n2:Agent;
     n0:accessTo       <./>;
     n0:defaultForNew  <./>;
     n0:mode           n0:Read.' > .acl`

    fs.writeFileSync(rootPath, defaultAcl)
  }

  // Finally starting solid
  var solid = require('../')
  var app
  try {
    app = solid.createServer(argv)
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
    fs.readFile(path.resolve(__dirname, '../package.json'), 'utf-8', function (_, file) {
      console.log('Solid server (solid v' + JSON.parse(file).version + ') running on \u001b[4mhttps://localhost:' + argv.port + '/\u001b[0m')
      console.log('Press <ctrl>+c to stop')
    })
  })
}

bin(argv)
