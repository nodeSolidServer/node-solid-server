// Main entry point - provides both CommonJS (for tests) and ESM (for modern usage)
module.exports = require('./lib/create-app-cjs')
module.exports.createServer = require('./lib/create-server-cjs')
module.exports.startCli = require('./bin/lib/cli.cjs')