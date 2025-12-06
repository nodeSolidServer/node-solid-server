import { describe, it } from 'mocha'
import chai from 'chai'
import dirtyChai from 'dirty-chai'
import TokenService from '../../lib/services/token-service.mjs'

const { expect } = chai
chai.use(dirtyChai)
chai.should()

describe('TokenService', () => {
  describe('constructor()', () => {
    it('should init with an empty tokens store', () => {
      const service = new TokenService()

      expect(service.tokens).to.exist()
    })
  })

  describe('generate()', () => {
    it('should generate a new token and return a token key', () => {
      const service = new TokenService()

      const token = service.generate('test')
      const value = service.tokens.test[token]

      expect(token).to.exist()
      expect(value).to.have.property('exp')
    })
  })

  describe('verify()', () => {
    it('should return false for expired tokens', () => {
      const service = new TokenService()

      const token = service.generate('foo')

      service.tokens.foo[token].exp = new Date(Date.now() - 1000)

      expect(service.verify('foo', token)).to.be.false()
    })

    it('should return the token value for valid tokens', () => {
      const service = new TokenService()

      const token = service.generate('bar')
      const value = service.verify('bar', token)

      expect(value).to.exist()
      expect(value).to.have.property('exp')
      expect(value.exp).to.be.greaterThan(new Date())
    })

    it('should throw error for invalid token domain', () => {
      const service = new TokenService()

      const token = service.generate('valid')

      expect(() => service.verify('invalid', token)).to.throw('Invalid domain for tokens: invalid')
    })

    it('should return false for non-existent tokens', () => {
      const service = new TokenService()

      // First create the domain
      service.generate('foo')

      expect(service.verify('foo', 'nonexistent')).to.be.false()
    })
  })

  describe('remove()', () => {
    it('should remove specific tokens', () => {
      const service = new TokenService()

      const token = service.generate('test')

      service.remove('test', token)

      expect(service.tokens.test).to.not.have.property(token)
    })
  })
})
