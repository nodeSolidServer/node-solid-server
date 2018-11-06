const blacklistConfig = require('../../config/usernames-blacklist.json')
const blacklist = require('the-big-username-blacklist').list

class BlacklistService {
  constructor () {
    this.reset()
  }

  addWord (word) {
    this.list.push(BlacklistService._prepareWord(word))
  }

  reset (config) {
    this.list = BlacklistService._initList(config)
  }

  validate (word) {
    return this.list.indexOf(BlacklistService._prepareWord(word)) === -1
  }

  static _initList (config = blacklistConfig) {
    return [
      ...(config.useTheBigUsernameBlacklist ? blacklist : []),
      ...config.customBlacklistedUsernames
    ]
  }

  static _prepareWord (word) {
    return word.trim().toLocaleLowerCase()
  }
}

module.exports = new BlacklistService()
