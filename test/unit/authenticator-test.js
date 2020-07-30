'use strict'
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))
chai.should()

const { Authenticator } = require('../../lib/models/authenticator')

describe('Authenticator', () => {
  describe('constructor()', () => {
    it('should initialize the accountManager property', () => {
      const accountManager = {}
      const auth = new Authenticator({ accountManager })

      expect(auth.accountManager).to.equal(accountManager)
    })
  })

  describe('fromParams()', () => {
    it('should throw an abstract method error', () => {
      expect(() => Authenticator.fromParams())
        .to.throw(/Must override method/)
    })
  })

  describe('findValidUser()', () => {
    it('should throw an abstract method error', () => {
      const auth = new Authenticator({})

      expect(() => auth.findValidUser())
        .to.throw(/Must override method/)
    })
  })
})
