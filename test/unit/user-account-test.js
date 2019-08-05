'use strict'

const chai = require('chai')
const expect = chai.expect
const UserAccount = require('../../lib/models/user-account')

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

  describe('id getter', () => {
    it('should return null if webId is null', () => {
      let account = new UserAccount()

      expect(account.id).to.be.null
    })

    it('should return the WebID uri minus the protocol and slashes', () => {
      let webId = 'https://alice.example.com/profile/card#me'
      let account = new UserAccount({ webId })

      expect(account.id).to.equal('alice.example.com/profile/card#me')
    })
  })
})
