'use strict'

const chai = require('chai')
const expect = chai.expect

const blacklist = require('the-big-username-blacklist').list
const blacklistService = require('../../lib/services/blacklist-service')

describe('BlacklistService', () => {
  afterEach(() => blacklistService.reset())

  describe('addWord', () => {
    it('allows adding words', () => {
      const numberOfBlacklistedWords = blacklistService.list.length
      blacklistService.addWord('foo')
      expect(blacklistService.list.length).to.equal(numberOfBlacklistedWords + 1)
    })
  })

  describe('reset', () => {
    it('will reset list of blacklisted words', () => {
      blacklistService.addWord('foo')
      blacklistService.reset()
      expect(blacklistService.list.length).to.equal(blacklist.length)
    })

    it('can configure service via reset', () => {
      blacklistService.reset({
        useTheBigUsernameBlacklist: false,
        customBlacklistedUsernames: ['foo']
      })
      expect(blacklistService.list.length).to.equal(1)
      expect(blacklistService.validate('admin')).to.equal(true)
    })

    it('is a singleton', () => {
      const instanceA = blacklistService
      blacklistService.reset({ customBlacklistedUsernames: ['foo'] })
      expect(instanceA.validate('foo')).to.equal(blacklistService.validate('foo'))
    })
  })

  describe('validate', () => {
    it('validates given a default list of blacklisted usernames', () => {
      const validWords = blacklist.reduce((memo, word) => memo + (blacklistService.validate(word) ? 1 : 0), 0)
      expect(validWords).to.equal(0)
    })
  })
})
