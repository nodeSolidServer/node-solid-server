var program = require('commander')
var packageJson = require('../../package.json')
var loadInit = require('./init')
var loadStart = require('./start')

module.exports = function cli (server) {
  program
  .version(packageJson.version)

  loadInit(program)
  loadStart(program, server)

  program.parse(process.argv)
  if (program.args.length === 0) program.help()
}
