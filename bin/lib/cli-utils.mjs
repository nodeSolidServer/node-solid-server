import fs from 'fs-extra'
import { red, cyan, bold } from 'colorette'
import { URL } from 'url'
import LDP from '../../lib/ldp.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'

export function getAccountManager (config, options = {}) {
  const ldp = options.ldp || new LDP(config)
  const host = options.host || SolidHost.from({ port: config.port, serverUri: config.serverUri })
  return AccountManager.from({
    host,
    store: ldp,
    multiuser: config.multiuser
  })
}

export function loadConfig (program, options) {
  let argv = {
    ...options,
    version: program.version()
  }
  const configFile = argv.configFile || './config.json'
  try {
    const file = fs.readFileSync(configFile)
    const config = JSON.parse(file)
    argv = { ...config, ...argv }
  } catch (err) {
    if (typeof argv.configFile !== 'undefined') {
      if (!fs.existsSync(configFile)) {
        console.log(red(bold('ERR')), 'Config file ' + configFile + " doesn't exist.")
        process.exit(1)
      }
    }
    if (fs.existsSync(configFile)) {
      console.log(red(bold('ERR')), 'config file ' + configFile + " couldn't be parsed: " + err)
      process.exit(1)
    }
    console.log(cyan(bold('TIP')), 'create a config.json: `$ solid init`')
  }
  return argv
}

export function loadAccounts ({ root, serverUri, hostname }) {
  const files = fs.readdirSync(root)
  hostname = hostname || new URL(serverUri).hostname
  const isUserDirectory = new RegExp(`.${hostname}$`)
  return files.filter(file => isUserDirectory.test(file))
}

export function loadUsernames ({ root, serverUri }) {
  const hostname = new URL(serverUri).hostname
  return loadAccounts({ root, hostname }).map(userDirectory => userDirectory.substr(0, userDirectory.length - hostname.length - 1))
}
