const { loadConfig } = require('./common')
const blacklistService = require('../../lib/services/blacklist-service')
const AccountManager = require('../../lib/models/account-manager')
const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')

module.exports = function (program) {
  program
    .command('blacklist')
    .option('--notify', 'Will notify users with usernames that are blacklisted')
    .option('--delete', 'Will delete users with usernames that are blacklisted')
    .description('Manage usernames that are blacklisted')
    .action(async (options) => {
      const config = await loadConfig(program, options)
      if (!config.multiuser) {
        return console.error('You are running a single user server, no need to check for blacklisted users')
      }
      const host = SolidHost.from({ port: config.port, serverUri: config.serverUri })

      const ldp = new LDP(config)
      const accountManager = AccountManager.from({
        // authMethod: argv.auth,
        // emailService: app.locals.emailService,
        // tokenService: app.locals.tokenService,
        host,
        // accountTemplatePath: argv.templates.account,
        store: ldp,
        multiuser: config.multiuser
      })
      const blacklistedUsernames = await getBlacklistedUsernames(accountManager)
      if (blacklistedUsernames.length === 0) {
        console.log('No blacklisted username was found')
      }
      console.log(`These blacklisted usernames were found:${blacklistedUsernames.map(username => `\n- ${username}`)}`)
    })
}

async function getBlacklistedUsernames (accountManager) {
  const blacklistedUsernames = []
  await Promise.all(blacklistService.list.map(async (word) => {
    const accountExists = await accountManager.accountExists(word)
    if (accountExists) {
      blacklistedUsernames.push(word)
    }
  }))
  return blacklistedUsernames
}
