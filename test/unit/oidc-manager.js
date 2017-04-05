'use strict'

const chai = require('chai')
const expect = chai.expect
const path = require('path')

const OidcManager = require('../../lib/models/oidc-manager')
const SolidHost = require('../../lib/models/solid-host')

describe('OidcManager', () => {
  describe('fromServerConfig()', () => {
    it('should error if no serverUri is provided in argv', () => {

    })

    it('should result in an initialized oidc object', () => {
      let serverUri = 'https://localhost:8443'
      let host = SolidHost.from({ serverUri })

      let dbPath = path.join(__dirname, '../resources/db')
      let saltRounds = 5
      let argv = {
        host,
        dbPath,
        saltRounds
      }

      let oidc = OidcManager.fromServerConfig(argv)

      expect(oidc.rs.defaults.query).to.be.true
      expect(oidc.clients.store.backend.path.endsWith('db/rp/clients'))
      expect(oidc.provider.issuer).to.equal(serverUri)
      expect(oidc.users.backend.path.endsWith('db/users'))
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })
  })
})
