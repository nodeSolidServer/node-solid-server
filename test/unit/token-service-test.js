'use strict'

const moment = require('moment')
const chai = require('chai')
const expect = chai.expect
const dirtyChai = require('dirty-chai')
chai.use(dirtyChai)
chai.should()

const TokenService = require('../../lib/models/token-service')

describe('TokenService', () => {
  describe('constructor()', () => {
    it('should init with an empty tokens store', () => {
      let service = new TokenService()

      expect(service.tokens).to.exist()
    })
  })

  describe('generate()', () => {
    it('should generate a new token and return a token key', () => {
      let service = new TokenService()

      let token = service.generate()
      let value = service.tokens[token]

      expect(token).to.exist()
      expect(value).to.have.property('exp')
    })
  })

  describe('verify()', () => {
    it('should return false for expired tokens', () => {
      let service = new TokenService()

      let token = service.generate()

      service.tokens[token].exp = moment().subtract(40, 'minutes')

      expect(service.verify(token)).to.be.false()
    })

    it('should return false for non-existent tokens', () => {
      let service = new TokenService()

      let token = 'invalid token 123'

      expect(service.verify(token)).to.be.false()
    })

    it('should return the token value if token not expired', () => {
      let service = new TokenService()

      let token = service.generate()

      expect(service.verify(token)).to.be.ok()
    })
  })

  describe('remove()', () => {
    it('should remove a generated token from the service', () => {
      let service = new TokenService()

      let token = service.generate()

      service.remove(token)

      expect(service.tokens[token]).to.not.exist()
    })
  })
})
