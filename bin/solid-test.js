#!/usr/bin/env node

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

const startCli = require('./lib/cli')
startCli()
