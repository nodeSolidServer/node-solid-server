import { createRequire } from 'module'
import chai from 'chai'
import sinonChai from 'sinon-chai'
import dirtyChai from 'dirty-chai'
import url, { fileURLToPath } from 'url'
import { dirname } from 'path'

import AuthRequest from '../../lib/requests/auth-request.mjs'
import SolidHost from '../../lib/models/solid-host.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'
import UserAccount from '../../lib/models/user-account.mjs'

const { expect } = chai
chai.use(sinonChai)
chai.use(dirtyChai)
chai.should()

describe('AuthRequest', () => {
  function testAuthQueryParams () {
    const body = {}
    body.response_type = 'code'
    body.scope = 'openid'
    body.client_id = 'client1'
    body.redirect_uri = 'https://redirect.example.com/'
    body.state = '1234'
    body.nonce = '5678'
    body.display = 'page'

    return body
  }

  const host = SolidHost.from({ serverUri: 'https://localhost:8443' })
  const accountManager = AccountManager.from({ host })

  describe('extractAuthParams()', () => {
    it('should initialize the auth url query object from params', () => {
      const body = testAuthQueryParams()
      body.other_key = 'whatever'
      const req = { body, method: 'POST' }

      const extracted = AuthRequest.extractAuthParams(req)

      for (const param of AuthRequest.AUTH_QUERY_PARAMS) {
        expect(extracted[param]).to.equal(body[param])
      }

      // make sure *only* the listed params were copied
      expect(extracted.other_key).to.not.exist()
    })

    it('should return empty params with no request body present', () => {
      const req = { method: 'POST' }

      expect(AuthRequest.extractAuthParams(req)).to.eql({})
    })
  })

  describe('authorizeUrl()', () => {
    it('should return an /authorize url', () => {
      const request = new AuthRequest({ accountManager })

      const authUrl = request.authorizeUrl()

      expect(authUrl.startsWith('https://localhost:8443/authorize')).to.be.true()
    })

    it('should pass through relevant auth query params from request body', () => {
      const body = testAuthQueryParams()
      const req = { body, method: 'POST' }

      const request = new AuthRequest({ accountManager })
      request.authQueryParams = AuthRequest.extractAuthParams(req)

      const authUrl = request.authorizeUrl()

      const parseQueryString = true
      const parsedUrl = url.parse(authUrl, parseQueryString)

      for (const param in body) {
        expect(body[param]).to.equal(parsedUrl.query[param])
      }
    })
  })

  describe('initUserSession()', () => {
    it('should initialize the request session', () => {
      const webId = 'https://alice.example.com/#me'
      const alice = UserAccount.from({ username: 'alice', webId })
      const session = {}

      const request = new AuthRequest({ session })

      request.initUserSession(alice)

      expect(request.session.userId).to.equal(webId)
      const subject = request.session.subject
      expect(subject._id).to.equal(webId)
    })
  })
})
