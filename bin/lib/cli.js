const program = require('commander')
const packageJson = require('../../package.json')
const loadInit = require('./init')
const loadStart = require('./start')

module.exports = function startCli (server) {
  program.version(packageJson.version)

  loadInit(program)
  loadStart(program, server)

  program.parse(process.argv)
  if (program.args.length === 0) program.help()
}
