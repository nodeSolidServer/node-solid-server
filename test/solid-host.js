'use strict'

const expect = require('chai').expect

const SolidHost = require('../lib/models/solid-host')

describe('SolidHost', () => {
  describe('fromConfig()', () => {
    it('should init with port, serverUri and hostname', () => {
      let config = {
        port: 3000,
        serverUri: 'https://localhost:3000'
      }
      let host = SolidHost.fromConfig(config)

      expect(host.port).to.equal(3000)
      expect(host.serverUri).to.equal('https://localhost:3000')
      expect(host.hostname).to.equal('localhost')
    })

    it('should init to default port and serverUri values', () => {
      let host = SolidHost.fromConfig({})
      expect(host.port).to.equal(SolidHost.DEFAULT_PORT)
      expect(host.serverUri).to.equal(SolidHost.DEFAULT_URI)
    })
  })

  describe('uriForAccount()', () => {
    it('should compose an account uri for an account name', () => {
      let config = {
        serverUri: 'https://test.local'
      }
      let host = SolidHost.fromConfig(config)

      expect(host.accountUriFor('alice')).to.equal('https://alice.test.local')
    })

    it('should throw an error if no account name is passed in', () => {
      let host = SolidHost.fromConfig()
      expect(() => { host.accountUriFor() }).to.throw(TypeError)
    })
  })
})
