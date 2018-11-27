const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const LDP = require('../../lib/ldp')
const { URL } = require('url')
const debug = require('../../lib/debug')
const { readFile } = require('../../lib/common/fs-utils')

const { compileTemplate, writeTemplate } = require('../../lib/common/template-utils')
const { loadConfig, loadAccounts } = require('./cli-utils')
const { getName, getWebId } = require('../../lib/common/user-utils')
const { initConfigDir, initTemplateDirs } = require('../../lib/server-config')

module.exports = function (program) {
  program
    .command('updateindex')
    .description('Update index.html in root of all PODs that haven\'t been marked otherwise')
    .action(async (options) => {
      const config = loadConfig(program, options)
      const configPath = initConfigDir(config)
      const templates = initTemplateDirs(configPath)
      const indexTemplatePath = path.join(templates.account, 'index.html')
      const indexTemplate = await compileTemplate(indexTemplatePath)
      const ldp = new LDP(config)
      const accounts = loadAccounts(config)
      const usersProcessed = accounts.map(async account => {
        const accountDirectory = path.join(config.root, account)
        const indexFilePath = path.join(accountDirectory, '/index.html')
        if (!isUpdateAllowed(indexFilePath)) {
          return
        }
        const accountUrl = getAccountUrl(account, config)
        try {
          const webId = await getWebId(accountDirectory, accountUrl, ldp.suffixMeta, (filePath) => readFile(filePath))
          const name = await getName(webId, ldp.fetchGraph)
          writeTemplate(indexFilePath, indexTemplate, { name, webId })
        } catch (err) {
          debug.errors(`Failed to create new index for ${account}: ${JSON.stringify(err, null, 2)}`)
        }
      })
      await Promise.all(usersProcessed)
      debug.accounts(`Processed ${usersProcessed.length} users`)
    })
}

function getAccountUrl (name, config) {
  const serverUrl = new URL(config.serverUri)
  return `${serverUrl.protocol}//${name}.${serverUrl.host}/`
}

function isUpdateAllowed (indexFilePath) {
  const indexSource = fs.readFileSync(indexFilePath, 'utf-8')
  const $ = cheerio.load(indexSource)
  const allowAutomaticUpdateValue = $('meta[name="solid-allow-automatic-updates"]').prop('content')
  return !allowAutomaticUpdateValue || allowAutomaticUpdateValue === 'true'
}
