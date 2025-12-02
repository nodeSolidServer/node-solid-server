import chai from 'chai'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import HttpMocks from 'node-mocks-http'
import LDP from '../../lib/ldp.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'
import ResourceMapper from '../../lib/resource-mapper.mjs'

import * as api from '../../lib/api/accounts/user-accounts.mjs'

const { expect } = chai
chai.should()

const __dirname = dirname(fileURLToPath(import.meta.url))

const testAccountsDir = join(__dirname, '..', '..', 'test', 'resources', 'accounts')

let host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('api/accounts/user-accounts', () => {
  describe('newCertificate()', () => {
    describe('in multi user mode', () => {
      const multiuser = true
      const resourceMapper = new ResourceMapper({
        rootUrl: 'https://localhost:8443/',
        includeHost: multiuser,
        rootPath: testAccountsDir
      })
      const store = new LDP({ multiuser, resourceMapper })

      it('should throw a 400 error if spkac param is missing', done => {
        const options = { host, store, multiuser, authMethod: 'oidc' }
        const accountManager = AccountManager.from(options)

        const req = {
          body: {
            webid: 'https://alice.example.com/#me'
          },
          session: { userId: 'https://alice.example.com/#me' },
          get: () => { return 'https://example.com' }
        }
        const res = HttpMocks.createResponse()

        const newCertificate = api.newCertificate(accountManager)

        newCertificate(req, res, (err) => {
          expect(err.status).to.equal(400)
          expect(err.message).to.equal('Missing spkac parameter')
          done()
        })
      })
    })
  })
})