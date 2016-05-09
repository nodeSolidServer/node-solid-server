// #!/usr/bin/env node

// var program = require('commander')
// var packageJson = require('../package.json')
// var loadInit = require('./lib/init')
// var loadStart = require('./lib/start')

// program
//   .version(packageJson.version)

// loadInit(program)
// loadStart(program)

// program.parse(process.argv)
// if (program.args.length === 0) program.help()

const init = require('./lib/init')
const start = require('./lib/start')
const options = require('./lib/options')

var yargs = require('yargs')
const argv = yargs
  .usage('usage: solid <command> [options]')
  .command('init', 'set up a configuration file', function (yargs) {
    const argv = yargs
      .usage('usage: solid create <item> [options]')
      .options({
        advanced: {
          description: 'ask extra questions'
        }
      })
      .help('help')
      .wrap(null)
      .argv

    init(argv)
  })
  .command('start', 'run a solid server', function (yargs) {
    let command = yargs
      .usage('usage: solid create [options]')

    const createOpts = options
      .filter((option) => !option.hide)
      .forEach(option => {
        if (option.default) delete option.default
        command.option(option.name, option)
      })

    command
      .help('help')
      .wrap(null)

    start(command.argv)
  })
  .help('help')
  .wrap(null)
  .argv

checkCommands(yargs, argv, 1)

function checkCommands (yargs, argv, numRequired) {
  if (argv._.length < numRequired) {
    yargs.showHelp()
  } else {
    // check for unknown command
  }
}
