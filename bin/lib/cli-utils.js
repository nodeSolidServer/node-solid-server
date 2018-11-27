const fs = require('fs-extra')
const { cyan, bold } = require('colorette')
const { URL } = require('url')
const LDP = require('../../lib/ldp')
const AccountManager = require('../../lib/models/account-manager')
const SolidHost = require('../../lib/models/solid-host')

module.exports.getAccountManager = getAccountManager
module.exports.loadAccounts = loadAccounts
module.exports.loadConfig = loadConfig
module.exports.loadUsernames = loadUsernames

/**
 * Returns an instance of AccountManager
 *
 * @param {Object} config
 * @param {Object} [options]
 * @returns {AccountManager}
 */
function getAccountManager (config, options = {}) {
  const ldp = options.ldp || new LDP(config)
  const host = options.host || SolidHost.from({ port: config.port, serverUri: config.serverUri })
  return AccountManager.from({
    host,
    store: ldp,
    multiuser: config.multiuser
  })
}

function loadConfig (program, options) {
  let argv = {
    ...options,
    version: program.version()
  }
  let configFile = argv['configFile'] || './config.json'

  try {
    const file = fs.readFileSync(configFile)

    // Use flags with priority over config file
    const config = JSON.parse(file)
    argv = { ...config, ...argv }
  } catch (err) {
    // No file exists, not a problem
    console.log(cyan(bold('TIP')), 'create a config.json: `$ solid init`')
  }

  return argv
}

/**
 *
 * @param root
 * @param [serverUri] If not set, hostname must be set
 * @param [hostname] If not set, serverUri must be set
 * @returns {*}
 */
function loadAccounts ({ root, serverUri, hostname }) {
  const files = fs.readdirSync(root)
  hostname = hostname || new URL(serverUri).hostname
  const isUserDirectory = new RegExp(`.${hostname}$`)
  return files
    .filter(file => isUserDirectory.test(file))
}

function loadUsernames ({ root, serverUri }) {
  const hostname = new URL(serverUri).hostname
  return loadAccounts({ root, hostname })
    .map(userDirectory => userDirectory.substr(0, userDirectory.length - hostname.length - 1))
}
