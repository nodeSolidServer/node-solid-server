'use strict'

const chai = require('chai')
const expect = chai.expect
const UserAccount = require('../lib/models/user-account')

describe('UserAccount', () => {
  describe('from()', () => {
    it('initializes the object with passed in options', () => {
      let options = {
        username: 'alice',
        webId: 'https://alice.com/#me',
        name: 'Alice',
        email: 'alice@alice.com'
      }

      let account = UserAccount.from(options)
      expect(account.username).to.equal(options.username)
      expect(account.webId).to.equal(options.webId)
      expect(account.name).to.equal(options.name)
      expect(account.email).to.equal(options.email)
    })
  })
})
