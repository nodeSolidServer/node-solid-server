'use strict'

const chai = require('chai')
const expect = chai.expect
// const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
// const HttpMocks = require('node-mocks-http')
const url = require('url')

const AuthRequest = require('../../lib/requests/auth-request')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const UserAccount = require('../../lib/models/user-account')

describe('AuthRequest', () => {
  function testAuthQueryParams () {
    let body = {}
    body['response_type'] = 'code'
    body['scope'] = 'openid'
    body['client_id'] = 'client1'
    body['redirect_uri'] = 'https://redirect.example.com/'
    body['state'] = '1234'
    body['nonce'] = '5678'
    body['display'] = 'page'

    return body
  }

  const host = SolidHost.from({ serverUri: 'https://localhost:8443' })
  const accountManager = AccountManager.from({ host })

  describe('extractAuthParams()', () => {
    it('should initialize the auth url query object from params', () => {
      let body = testAuthQueryParams()
      body['other_key'] = 'whatever'
      let req = { body, method: 'POST' }

      let extracted = AuthRequest.extractAuthParams(req)

      for (let param of AuthRequest.AUTH_QUERY_PARAMS) {
        expect(extracted[param]).to.equal(body[param])
      }

      // make sure *only* the listed params were copied
      expect(extracted['other_key']).to.not.exist()
    })

    it('should return empty params with no request body present', () => {
      let req = { method: 'POST' }

      expect(AuthRequest.extractAuthParams(req)).to.eql({})
    })
  })

  describe('authorizeUrl()', () => {
    it('should return an /authorize url', () => {
      let request = new AuthRequest({ accountManager })

      let authUrl = request.authorizeUrl()

      expect(authUrl.startsWith('https://localhost:8443/authorize')).to.be.true()
    })

    it('should pass through relevant auth query params from request body', () => {
      let body = testAuthQueryParams()
      let req = { body, method: 'POST' }

      let request = new AuthRequest({ accountManager })
      request.authQueryParams = AuthRequest.extractAuthParams(req)

      let authUrl = request.authorizeUrl()

      let parseQueryString = true
      let parsedUrl = url.parse(authUrl, parseQueryString)

      for (let param in body) {
        expect(body[param]).to.equal(parsedUrl.query[param])
      }
    })
  })

  describe('initUserSession()', () => {
    it('should initialize the request session', () => {
      let webId = 'https://alice.example.com/#me'
      let alice = UserAccount.from({ username: 'alice', webId })
      let session = {}

      let request = new AuthRequest({ session })

      request.initUserSession(alice)

      expect(request.session.userId).to.equal(webId)
      let subject = request.session.subject
      expect(subject['_id']).to.equal(webId)
    })
  })
})

