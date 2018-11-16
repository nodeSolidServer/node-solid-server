const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const Handlebars = require('handlebars')
const LDP = require('../../lib/ldp')
const $rdf = require('rdflib')
const { URL } = require('url')

const { getAccountManager, loadConfig, loadUsernames } = require('./common')
const { initConfigDir, initTemplateDirs } = require('../../lib/server-config')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

module.exports = function (program) {
  program
    .command('updateindex')
    .description('Update index.html in root of all PODs that haven\'t been marked otherwise')
    .action(async (options) => {
      const config = loadConfig(program, options)
      const ldp = new LDP(config)
      const configPath = initConfigDir(config)
      const templates = initTemplateDirs(configPath)
      const accountManager = getAccountManager(config, { ldp })
      const usernames = loadUsernames(config)
      const indexTemplatePath = path.join(templates.account, 'index.html')
      const indexTemplateSource = fs.readFileSync(indexTemplatePath, 'utf-8')
      const indexTemplate = Handlebars.compile(indexTemplateSource)
      const usersProcessed = usernames.map(async name => {
        const userDirectory = accountManager.accountDirFor(name)
        const indexFilePath = path.join(userDirectory, 'index.html')
        const indexSource = fs.readFileSync(indexFilePath, 'utf-8')
        const $ = cheerio.load(indexSource)
        const allowAutomaticUpdateValue = $('meta[name="solid-allow-automatic-updates"]').prop('content')
        const allowAutomaticUpdate = !allowAutomaticUpdateValue || allowAutomaticUpdateValue === 'true'
        if (!allowAutomaticUpdate) {
          return
        }
        const serverUrl = new URL(config.serverUri)
        const accountUrl = `${serverUrl.protocol}//${name}.${serverUrl.host}/`
        const metaFileUri = `${accountUrl}/${ldp.suffixMeta}`
        const metaData = await ldp.readContainerMeta(userDirectory)
        const metaGraph = $rdf.graph()
        $rdf.parse(metaData, metaGraph, metaFileUri, 'text/turtle')
        const webIdNode = metaGraph.any(undefined, SOLID('account'), $rdf.sym(accountUrl))
        const webId = webIdNode.value
        const newIndexSource = indexTemplate({ name, webId })
        fs.writeFileSync(indexFilePath, newIndexSource, 'utf-8')
      })
      await Promise.all(usersProcessed)
      console.log(`Processed ${usersProcessed.length} users`)
    })
}

