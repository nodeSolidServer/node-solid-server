const fs = require('fs')
const extend = require('extend')
const { cyan, bold } = require('colorette')

module.exports.loadConfig = loadConfig

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
