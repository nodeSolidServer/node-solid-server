import { fileURLToPath } from 'url'
import path from 'path'
import chai from 'chai'
import fs from 'fs-extra'
import OidcManager from '../../lib/models/oidc-manager.js'
import SolidHost from '../../lib/models/solid-host.js'

const { expect } = chai

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '../../test/resources/.db')

describe('OidcManager', () => {
  beforeEach(() => {
    fs.removeSync(dbPath)
  })

  describe('fromServerConfig()', () => {
    it('should result in an initialized oidc object', () => {
      const serverUri = 'https://localhost:8443'
      const host = SolidHost.from({ serverUri })

      const saltRounds = 5
      const argv = {
        host,
        dbPath,
        saltRounds
      }

      const oidc = OidcManager.fromServerConfig(argv)

      expect(oidc.rs.defaults.query).to.be.true
      expect(oidc.clients.store.backend.path.endsWith('db/oidc/rp/clients'))
      expect(oidc.provider.issuer).to.equal(serverUri)
      expect(oidc.users.backend.path.endsWith('db/oidc/users'))
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })
  })
})
