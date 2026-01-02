// import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import chai from 'chai'

// const require = createRequire(import.meta.url)
// const OidcManager = require('../../lib/models/oidc-manager')
// const SolidHost = require('../../lib/models/solid-host')
import * as OidcManager from '../../lib/models/oidc-manager.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'

const { expect } = chai

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
      const clientsPath = oidc.clients.store.backend.path
      const usersPath = oidc.users.backend.path
      // Check that the clients path contains an 'rp' segment (or 'clients') to handle layout differences
      const clientsSegments = clientsPath.split(path.sep)
      expect(clientsSegments.includes('rp') || clientsSegments.includes('clients')).to.be.true
      expect(oidc.provider.issuer).to.equal(serverUri)
      const usersSegments = usersPath.split(path.sep)
      expect(usersSegments.includes('users')).to.be.true
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })
  })
})
