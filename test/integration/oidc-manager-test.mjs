import { fileURLToPath } from 'url'
import path from 'path'
import { URL } from 'url'
import chai from 'chai'
import fs from 'fs-extra'
import { fromServerConfig } from '../../lib/models/oidc-manager.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'

const { expect } = chai

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '../resources/.db')

describe('OidcManager', () => {
  beforeEach(() => {
    fs.removeSync(dbPath)
  })

  describe('fromServerConfig()', () => {
    it('should result in an initialized oidc object', () => {
      const providerUri = 'https://localhost:8443'
      const host = SolidHost.from({ providerUri })

      const saltRounds = 5
      const argv = {
        host,
        dbPath,
        saltRounds
      }

      const oidc = fromServerConfig(argv)

      expect(oidc.rs.defaults.query).to.be.true
      expect(oidc.clients.store.backend.path.endsWith('db/oidc/rp/clients'))
      expect(oidc.provider.issuer).to.equal(providerUri)
      expect(oidc.users.backend.path.endsWith('db/oidc/users'))
      expect(oidc.users.saltRounds).to.equal(saltRounds)
    })

    it('should set the provider issuer which is used for iss claim in tokens', () => {
      const providerUri = 'https://pivot-test.solidproject.org:8443'
      const host = SolidHost.from({ serverUri: providerUri })

      const saltRounds = 5
      const argv = {
        host,
        dbPath,
        saltRounds
      }

      const oidc = fromServerConfig(argv)

      // Verify the issuer is set correctly for RFC 9207 compliance
      // The iss claim in tokens should match this issuer value
      expect(oidc.provider.issuer).to.exist
      expect(oidc.provider.issuer).to.not.be.null
      expect(oidc.provider.issuer).to.equal(providerUri)
      console.log('Provider issuer (used for iss claim):', oidc.provider.issuer)
    })
  })

  describe('RFC 9207 - Authorization redirect with iss parameter', () => {
    it('should include iss parameter when redirecting after authorization', async () => {
      const providerUri = 'https://localhost:8443'
      const host = SolidHost.from({ providerUri })

      const argv = {
        host,
        dbPath,
        saltRounds: 5
      }

      const oidc = fromServerConfig(argv)

      // Dynamically import BaseRequest from oidc-op
      const { default: BaseRequest } = await import('@solid/oidc-op/src/handlers/BaseRequest.js')

      // Create a mock request/response to test the redirect behavior
      const mockReq = {
        method: 'GET',
        query: {
          response_type: 'code',
          redirect_uri: 'https://app.example.com/callback',
          client_id: 'https://app.example.com',
          state: 'test-state'
        }
      }

      const mockRes = {
        redirectCalled: false,
        redirectUrl: '',
        redirect (url) {
          this.redirectCalled = true
          this.redirectUrl = url
        }
      }

      const request = new BaseRequest(mockReq, mockRes, oidc.provider)
      request.params = mockReq.query

      // Simulate a successful authorization by calling redirect with auth data
      try {
        request.redirect({ code: 'test-auth-code' })
      } catch (err) {
        // The redirect throws a HandledError, which is expected behavior
        // We just need to check that the redirect was called with the right URL
      }

      expect(mockRes.redirectCalled).to.be.true
      expect(mockRes.redirectUrl).to.exist

      // Parse the redirect URL to check for iss parameter
      const redirectUrl = new URL(mockRes.redirectUrl)

      // The iss parameter can be in either the query string or hash fragment
      // depending on the response_mode (query or fragment)
      let issParam = redirectUrl.searchParams.get('iss')
      if (!issParam && redirectUrl.hash) {
        // Check in the hash fragment
        const hashParams = new URLSearchParams(redirectUrl.hash.substring(1))
        issParam = hashParams.get('iss')
      }

      console.log('Redirect URL:', mockRes.redirectUrl)
      console.log('RFC 9207 - iss parameter in redirect:', issParam)

      // RFC 9207: The iss parameter MUST be present and match the provider issuer
      expect(issParam, 'RFC 9207: iss parameter must be present in authorization response').to.exist
      expect(issParam).to.not.be.null
      expect(issParam).to.equal(providerUri)
    })
  })
})
