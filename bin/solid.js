#!/usr/bin/env node

var program = require('commander')
var packageJson = require('../package.json')
var loadInit = require('./lib/init')
var loadStart = require('./lib/start')

program
  .version(packageJson.version)

loadInit(program)
loadStart(program)

program.parse(process.argv)
