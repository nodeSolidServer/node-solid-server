import { createRequire } from 'module'
import bigUsernameBlacklistPkg from 'the-big-username-blacklist'
const require = createRequire(import.meta.url)
const blacklistConfig = require('../../config/usernames-blacklist.json')
const { list: bigBlacklist } = bigUsernameBlacklistPkg

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
      ...(config.useTheBigUsernameBlacklist ? bigBlacklist : []),
      ...config.customBlacklistedUsernames
    ]
  }

  static _prepareWord (word) {
    return word.trim().toLocaleLowerCase()
  }
}

export default new BlacklistService()
