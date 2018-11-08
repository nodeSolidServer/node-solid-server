const fs = require('fs')
const extend = require('extend')
const { cyan, bold } = require('colorette')
const util = require('util')

module.exports = {}
module.exports.loadConfig = loadConfig

async function loadConfig (program, options) {
  let argv = extend({}, options, { version: program.version() })
  let configFile = argv['configFile'] || './config.json'

  try {
    const file = await util.promisify(fs.readFile)(configFile)

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
