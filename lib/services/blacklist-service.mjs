import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const blacklistConfig = require('../../config/usernames-blacklist.json')
const { list: blacklist } = require('the-big-username-blacklist')

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

export default new BlacklistService()