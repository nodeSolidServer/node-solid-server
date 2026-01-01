import options from './options.mjs'
import fs from 'fs'
import path from 'path'
import { loadConfig } from './cli-utils.mjs'
import { red, bold } from 'colorette'

export default function (program, server) {
  const start = program
    .command('start')
    .description('run the Solid server')

  options
    .filter((option) => !option.hide)
    .forEach((option) => {
      const configName = option.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      const snakeCaseName = configName.replace(/([A-Z])/g, '_$1')
      const envName = `SOLID_${snakeCaseName.toUpperCase()}`
      let name = '--' + option.name
      if (!option.flag) {
        name += ' [value]'
      }
      if (process.env[envName]) {
        const raw = process.env[envName]
        const envValue = /^(true|false)$/.test(raw) ? raw === 'true' : raw
        start.option(name, option.help, envValue)
      } else {
        start.option(name, option.help)
      }
    })

  start.option('-q, --quiet', 'Do not print the logs to console')

  start.action(async (options) => {
    const config = loadConfig(program, options)
    await bin(config, server)
  })
}

async function bin (argv, server) {
  if (!argv.email) {
    argv.email = {
      host: argv.emailHost,
      port: argv.emailPort,
      secure: true,
      auth: {
        user: argv.emailAuthUser,
        pass: argv.emailAuthPass
      }
    }
    delete argv.emailHost
    delete argv.emailPort
    delete argv.emailAuthUser
    delete argv.emailAuthPass
  }
  if (!argv.tokenTypesSupported) {
    argv.tokenTypesSupported = ['legacyPop', 'dpop']
  }
  argv.live = !argv.noLive
  if (!argv.quiet) {
    const debug = await import('debug')
    debug.default.enable('solid:*')
  }
  argv.port = argv.port || 3456
  if (argv.webid !== false) {
    argv.webid = true
  }
  if (!argv.webid && argv.multiuser) {
    throw new Error('Server cannot operate as multiuser without webids')
  }
  if (process.platform !== 'win32') {
    process.on('SIGINT', function () {
      console.log('\nSolid stopped.')
      process.exit()
    })
  }
  if (argv.owner) {
    let rootPath = path.resolve(argv.root || process.cwd())
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
     n0:default        <./>;
     n0:mode           n0:Control, n0:Read, n0:Write.
  <#everyone>
     a                 n0:Authorization;
     n0:               n2:Agent;
     n0:accessTo       <./>;
     n0:default        <./>;
     n0:mode           n0:Read.`
    fs.writeFileSync(rootPath, defaultAcl)
  }
  const solid = (await import('../../index.mjs')).default
  let app
  try {
    app = solid.createServer(argv, server)
  } catch (e) {
    if (e.code === 'EACCES') {
      if (e.syscall === 'mkdir') {
        console.log(red(bold('ERROR')), `You need permissions to create '${e.path}' folder`)
      } else {
        console.log(red(bold('ERROR')), 'You need root privileges to start on this port')
      }
      return 1
    }
    if (e.code === 'EADDRINUSE') {
      console.log(red(bold('ERROR')), 'The port ' + argv.port + ' is already in use')
      return 1
    }
    console.log(red(bold('ERROR')), e.message)
    return 1
  }
  app.listen(argv.port, function () {
    console.log('ESM Solid server')
    console.log(`Solid server (${argv.version}) running on \u001b[4mhttps://localhost:${argv.port}/\u001b[0m`)
    console.log('Press <ctrl>+c to stop')
  })
}
