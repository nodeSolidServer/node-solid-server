const { getAccountManager, loadConfig, loadUsernames } = require('./common')
const path = require('path')

module.exports = function (program) {
  program
    .command('updateindex')
    .description('Update index.html in root of all PODs that haven\'t been marked otherwise')
    .action((options) => {
      const config = loadConfig(program, options)
      const usernames = loadUsernames(config)
      usernames.forEach(username => updateIndex(username, config))
    })
}

function updateIndex (username, config) {
  const accountManager = getAccountManager(config)
  const userDirectory = accountManager.accountDirFor(username)
  const indexFile = path.join(userDirectory, 'index.html')
  console.log(indexFile)
}
