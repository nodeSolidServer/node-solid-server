const fs = require('fs-extra')
const Handlebars = require('handlebars')
const path = require('path')
const { URL } = require('url')
const util = require('util')

const { loadConfig } = require('./common')
const { isValidUsername } = require('../../lib/common/user-utils')
const blacklistService = require('../../lib/services/blacklist-service')
const { initConfigDir, initTemplateDirs } = require('../../lib/server-config')
const { fromServerConfig } = require('../../lib/models/oidc-manager')

const AccountManager = require('../../lib/models/account-manager')
const EmailService = require('../../lib/services/email-service')
const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')

const fileExists = util.promisify(fs.exists)
const fileRename = util.promisify(fs.rename)

module.exports = function (program) {
  program
    .command('invalidusernames')
    .option('--notify', 'Will notify users with usernames that are invalid')
    .option('--delete', 'Will delete users with usernames that are invalid')
    .description('Manage usernames that are invalid')
    .action(async (options) => {
      const config = await loadConfig(program, options)
      if (!config.multiuser) {
        return console.error('You are running a single user server, no need to check for invalid usernames')
      }

      const invalidUsernames = await getInvalidUsernames(config)
      const host = SolidHost.from({ port: config.port, serverUri: config.serverUri })
      const accountManager = getAccountManager(config, host)

      if (options.notify) {
        return notifyUsers(invalidUsernames, accountManager, config)
      }

      if (options.delete) {
        return deleteUsers(invalidUsernames, accountManager, config, host)
      }

      listUsernames(listUsernames)
    })
}

async function createNewIndexFile (username, accountManager, invalidUsernameTemplate, dateOfRemoval, supportEmail, fileOptions) {
  const userDirectory = accountManager.accountDirFor(username)
  const currentIndex = path.join(userDirectory, 'index.html')
  const currentIndexExists = await fileExists(currentIndex)
  const backupIndex = path.join(userDirectory, 'index.backup.html')
  const backupIndexExists = await fileExists(backupIndex)
  if (currentIndexExists && !backupIndexExists) {
    await fileRename(currentIndex, backupIndex)
    const newIndexSource = invalidUsernameTemplate({
      username,
      dateOfRemoval,
      supportEmail
    })
    fs.writeFileSync(currentIndex, newIndexSource, fileOptions)
    console.info(`index.html updated for user ${username}`)
  }
}

async function deleteUsers (usernames, accountManager, config, host) {
  const oidcManager = fromServerConfig({
    ...config,
    host
  })
  const deletingUsers = usernames
    .map(async username => {
      try {
        const user = accountManager.userAccountFrom({ username })
        await oidcManager.users.deleteUser(user)
      } catch (error) {
        if (error.message !== 'No email given') {
          // 'No email given' is an expected error that we want to ignore
          throw error
        }
      }
      const userDirectory = accountManager.accountDirFor(username)
      await fs.remove(userDirectory)
    })
  await Promise.all(deletingUsers)
  console.info(`Deleted ${deletingUsers.length} users succeeded`)
}

function getAccountManager (config, host) {
  const ldp = new LDP(config)
  return AccountManager.from({
    host,
    store: ldp,
    multiuser: config.multiuser
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

function listUsernames (usernames) {
  if (usernames.length === 0) {
    console.info('No invalid usernames was found')
  }
  console.info(`${usernames.length} invalid usernames were found:${usernames.map(username => `\n- ${username}`)}`)
}

async function notifyUsers (usernames, accountManager, config) {
  const twoWeeksFromNow = Date.now() + 14 * 24 * 60 * 60 * 1000
  const dateOfRemoval = (new Date(twoWeeksFromNow)).toLocaleDateString()
  const { supportEmail } = config

  await updateIndexFiles(usernames, accountManager, dateOfRemoval, supportEmail)
  await sendEmails(config, usernames, accountManager, dateOfRemoval, supportEmail)
}

async function sendEmails (config, usernames, accountManager, dateOfRemoval, supportEmail) {
  if (config.email && config.email.host) {
    const configPath = initConfigDir(config)
    const templates = initTemplateDirs(configPath)
    const users = await Promise.all(await usernames.map(async username => {
      const emailAddress = await accountManager.loadAccountRecoveryEmail({ username })
      const accountUri = accountManager.accountUriFor(username)
      return { username, emailAddress, accountUri }
    }))
    const emailService = new EmailService(templates.email, config.email)
    const sendingEmails = await users
      .filter(user => !!user.emailAddress)
      .map(async user => await emailService.sendWithTemplate('invalid-username', {
        to: user.emailAddress,
        accountUri: user.accountUri,
        dateOfRemoval,
        supportEmail
      }))
    const emailsSent = await Promise.all(sendingEmails)
    console.info(`${emailsSent.length} emails sent to users with invalid usernames`)
    return
  }
  console.info('You have not configured an email service.')
  console.info('Please set it up to send users email about their accounts')
}

async function updateIndexFiles (usernames, accountManager, dateOfRemoval, supportEmail) {
  const invalidUsernameFilePath = path.join(process.cwd(), 'default-views/account/invalid-username.hbs')
  const fileOptions = {
    encoding: 'utf-8'
  }
  const source = fs.readFileSync(invalidUsernameFilePath, fileOptions)
  const invalidUsernameTemplate = Handlebars.compile(source)
  const updatingFiles = usernames.map(username => createNewIndexFile(username, accountManager, invalidUsernameTemplate, dateOfRemoval, supportEmail, fileOptions))
  return Promise.all(updatingFiles)
}
