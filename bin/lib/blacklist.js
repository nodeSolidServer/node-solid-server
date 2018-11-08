const fs = require('fs')
const util = require('util')
const { URL } = require('url')

const { loadConfig } = require('./common')
const { isValidUsername } = require('../../lib/common/user-utils')
const blacklistService = require('../../lib/services/blacklist-service')

// const AccountManager = require('../../lib/models/account-manager')
// const LDP = require('../../lib/ldp')
// const SolidHost = require('../../lib/models/solid-host')

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

      // const host = SolidHost.from({ port: config.port, serverUri: config.serverUri })
      const invalidUsernames = await getInvalidUsernames(config)

      // const ldp = new LDP(config)
      // const accountManager = AccountManager.from({
      //   // authMethod: argv.auth,
      //   // emailService: app.locals.emailService,
      //   // tokenService: app.locals.tokenService,
      //   host,
      //   // accountTemplatePath: argv.templates.account,
      //   store: ldp,
      //   multiuser: config.multiuser
      // })
      // const blacklistedUsernames = await getBlacklistedUsernames(accountManager)
      // if (blacklistedUsernames.length === 0) {
      //   console.log('No blacklisted username was found')
      // }
      // console.log(`These blacklisted usernames were found:${blacklistedUsernames.map(username => `\n- ${username}`)}`)

      if (invalidUsernames.length === 0) {
        console.log('No invalid username was found')
      }
      console.log(`${invalidUsernames.length} invalid usernames were found:${invalidUsernames.map(username => `\n- ${username}`)}`)
    })
}

async function getInvalidUsernames (config) {
  const files = await util.promisify(fs.readdir)(config.root)
  const hostname = new URL(config.serverUri).hostname
  const isUserDirectory = new RegExp(`.${hostname}$`)
  return files
    .filter(file => isUserDirectory.test(file))
    .map(userDirectory => userDirectory.substr(0, userDirectory.length - hostname.length - 1))
    .filter(username => !isValidUsername(username) || !blacklistService.validate(username))
}

// async function getBlacklistedUsernames (accountManager) {
//   const blacklistedUsernames = []
//   await Promise.all(blacklistService.list.map(async (word) => {
//     const accountExists = await accountManager.accountExists(word)
//     if (accountExists) {
//       blacklistedUsernames.push(word)
//     }
//   }))
//   return blacklistedUsernames
// }
