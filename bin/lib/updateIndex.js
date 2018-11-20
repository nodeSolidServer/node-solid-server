const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const LDP = require('../../lib/ldp')
const { URL } = require('url')
const debug = require('../../lib/debug')

const { compileTemplate, writeTemplate } = require('../../lib/common/template-utils')
const { getAccountManager, loadConfig, loadUsernames } = require('./cli-utils')
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
      const accountManager = getAccountManager(config, { ldp })
      const usernames = loadUsernames(config)
      const usersProcessed = usernames.map(async username => {
        const accountDirectory = accountManager.accountDirFor(username)
        const indexFilePath = path.join(accountDirectory, 'index.html')
        if (!isUpdateAllowed(indexFilePath)) {
          return
        }
        const accountUrl = getAccountUrl(username, config)
        try {
          const webId = await getWebId(accountDirectory, accountUrl, { ldp })
          const name = await getName(webId, { ldp })
          writeTemplate(indexFilePath, indexTemplate, { name, webId })
        } catch (err) {
          debug.errors(`Failed to create new index for ${username}: ${JSON.stringify(err, null, 2)}`)
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
