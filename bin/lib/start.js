'use strict'

const options = require('./options')
const fs = require('fs')
const extend = require('extend')
const packageJson = require('../../package.json')
const colors = require('colors/safe')

module.exports = function (program, server) {
  const start = program
    .command('start')
    .description('run the Solid server')

  options
    .filter((option) => !option.hide)
    .forEach((option) => {
      var name = '--' + option.name
      if (!option.flag) {
        name += ' [value]'
      }
      start.option(name, option.help)
    })

  start.option('-v, --verbose', 'Print the logs to console')

  start.action((opts) => {
    let argv = extend({}, opts)

    fs.readFile(process.cwd() + '/config.json', (err, file) => {
      // No file exists, not a problem
      if (err) {
        console.log(colors.cyan.bold('TIP'), 'create a config.json: `$ solid init`')
      } else {
        // Use flags with priority over config file
        const config = JSON.parse(file)
        Object.keys(config).forEach((option) => {
          argv[option] = argv[option] || config[option]
        })
      }

      bin(argv, server)
    })
  })
}

function bin (argv, server) {
  if (!argv.email) {
    argv.email = {
      host: argv['emailHost'],
      port: argv['emailPort'],
      secure: true,
      auth: {
        user: argv['emailAuthUser'],
        pass: argv['emailAuthPass']
      }
    }
    delete argv['emailHost']
    delete argv['emailPort']
    delete argv['emailAuthUser']
    delete argv['emailAuthPass']
  }

  // Set up --no-*
  argv.live = !argv.noLive

  // Set up debug environment
  process.env.DEBUG = argv.verbose ? 'solid:*' : false

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
      console.log('\nSolid stopped.')
      process.exit()
    })
  }

  // Overwrite root .acl if owner is specified
  if (argv.owner) {
    let rootPath = argv.root
    if (!rootPath) {
      rootPath = process.cwd()
    }
    if (!(rootPath.endsWith('/'))) {
      rootPath += '/'
    }
    rootPath += (argv.suffixAcl || '.acl')

    const defaultAcl = `@prefix n0: <http://www.w3.org/ns/auth/acl#>.
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
     n0:mode           n0:Read.`

    fs.writeFileSync(rootPath, defaultAcl)
  }

  // // Finally starting solid
  const solid = require('../../')
  let app
  try {
    app = solid.createServer(argv, server)
  } catch (e) {
    if (e.code === 'EACCES') {
      console.log(colors.red.bold('ERROR'), 'You need root privileges to start on this port')
      return 1
    }
    if (e.code === 'EADDRINUSE') {
      console.log(colors.red.bold('ERROR'), 'The port ' + argv.port + ' is already in use')
      return 1
    }
    console.log(colors.red.bold('ERROR'), e.message)
    return 1
  }
  app.listen(argv.port, function () {
    console.log('Solid server (solid v' + packageJson.version + ') running on \u001b[4mhttps://localhost:' + argv.port + '/\u001b[0m')
    console.log('Press <ctrl>+c to stop')
  })
}
