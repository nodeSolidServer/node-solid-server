const fs = require('fs-extra')
const extend = require('extend')
const { cyan, bold } = require('colorette')
const { URL } = require('url')
const LDP = require('../../lib/ldp')
const AccountManager = require('../../lib/models/account-manager')
const SolidHost = require('../../lib/models/solid-host')

module.exports.getAccountManager = getAccountManager
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
  let argv = extend({}, options, { version: program.version() })
  let configFile = argv['configFile'] || './config.json'

  try {
    const file = fs.readFileSync(configFile)

    // Use flags with priority over config file
    const config = JSON.parse(file)
    Object.keys(config).forEach((option) => {
      argv[option] = argv[option] || config[option]
    })
  } catch (err) {
    // No file exists, not a problem
    console.log(cyan(bold('TIP')), 'create a config.json: `$ solid init`')
  }

  return argv
}

function loadUsernames (config) {
  const files = fs.readdirSync(config.root)
  const hostname = new URL(config.serverUri).hostname
  const isUserDirectory = new RegExp(`.${hostname}$`)
  return files
    .filter(file => isUserDirectory.test(file))
    .map(userDirectory => userDirectory.substr(0, userDirectory.length - hostname.length - 1))
}
