import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import chai from 'chai'

const { expect } = chai

const require = createRequire(import.meta.url)
const OidcManager = require('../../lib/models/oidc-manager')
const SolidHost = require('../../lib/models/solid-host')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('OidcManager', () => {
  describe('fromServerConfig()', () => {
    it('should error if no serverUri is provided in argv', () => {

    })

    it('should result in an initialized oidc object', () => {
      const serverUri = 'https://localhost:8443'
      const host = SolidHost.from({ serverUri })

      const dbPath = path.join(__dirname, '../resources/db')
      const saltRounds = 5
      const argv = {
        host,
        dbPath,
        saltRounds
      }

      const oidc = OidcManager.fromServerConfig(argv)

      expect(oidc.rs.defaults.query).to.be.true
      expect(oidc.clients.store.backend.path.endsWith('db/rp/clients'))
      expect(oidc.provider.issuer).to.equal(serverUri)
      expect(oidc.users.backend.path.endsWith('db/users'))
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })
  })
})