'use strict'

const chai = require('chai')
const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const DiscoverProviderRequest = require('../../lib/requests/discover-provider-request')

describe('DiscoverProviderRequest', () => {
  describe('normalizeWebId()', () => {
    it('should prepend https:// if one is missing', () => {
      let result = DiscoverProviderRequest.normalizeUri('localhost:8443')
      expect(result).to.equal('https://localhost:8443')
    })

    it('should return null if given a null uri', () => {
      let result = DiscoverProviderRequest.normalizeUri(null)
      expect(result).to.be.null
    })

    it('should return a valid uri unchanged', () => {
      let result = DiscoverProviderRequest.normalizeUri('https://alice.example.com')
      expect(result).to.equal('https://alice.example.com')
    })
  })

  describe('fromParams()', () => {
    let res = HttpMocks.createResponse()

    it('should initialize a DiscoverProviderRequest instance', () => {
      let aliceWebId = 'https://alice.example.com'
      let oidcManager = {}
      let session = {}
      let req = {
        session,
        body: { webid: aliceWebId },
        app: { locals: { oidc: oidcManager } }
      }

      let request = DiscoverProviderRequest.fromParams(req, res)
      expect(request.webId).to.equal(aliceWebId)
      expect(request.response).to.equal(res)
      expect(request.oidcManager).to.equal(oidcManager)
      expect(request.session).to.equal(session)
    })

    it('should throw a 500 error if no oidcManager was initialized', (done) => {
      let aliceWebId = 'https://alice.example.com'
      let req = {
        body: { webid: aliceWebId }
        // no app.locals.oidc
      }

      try {
        DiscoverProviderRequest.fromParams(req, res)
      } catch (error) {
        expect(error.statusCode).to.equal(500)
        done()
      }
    })

    it('should throw a 400 error if no webid is submitted', (done) => {
      let req = {}

      try {
        DiscoverProviderRequest.fromParams(req, res)
      } catch (error) {
        expect(error.statusCode).to.equal(400)
        done()
      }
    })

    it('should attempt to normalize an invalid webid uri', () => {
      let oidcManager = {}
      let session = {}
      let req = {
        session,
        body: { webid: 'alice.example.com' },
        app: { locals: { oidc: oidcManager } }
      }

      let request = DiscoverProviderRequest.fromParams(req, res)
      expect(request.webId).to.equal('https://alice.example.com')
    })
  })
})
