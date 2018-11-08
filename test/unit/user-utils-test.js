const chai = require('chai')
const expect = chai.expect
const userUtils = require('../../lib/common/user-utils')

describe('user-utils', () => {
  describe('isValidUsername', () => {
    it('should accect valid usernames', () => {
      const usernames = [
        'foo',
        'bar'
      ]
      const validUsernames = usernames.filter(username => userUtils.isValidUsername(username))
      expect(validUsernames.length).to.equal(usernames.length)
    })

    it('should not accect invalid usernames', () => {
      const usernames = [
        '-',
        '-a',
        'a-',
        '9-',
        'alice--bob',
        'alice bob',
        'alice.bob'
      ]
      const validUsernames = usernames.filter(username => userUtils.isValidUsername(username))
      expect(validUsernames.length).to.equal(0)
    })
  })
})
