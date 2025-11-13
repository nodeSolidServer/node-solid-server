import { describe, it, beforeEach } from 'mocha'
import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import dirtyChai from 'dirty-chai'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { expect } = chai
chai.use(sinonChai)
chai.use(dirtyChai)
chai.should()

// Import CommonJS modules
const Auth = require('../../lib/api/authn')

describe('OIDC Handler', () => {
  describe('setAuthenticateHeader()', () => {
    let res, req

    beforeEach(() => {
      req = {
        app: {
          locals: { host: { serverUri: 'https://example.com' } }
        },
        get: sinon.stub()
      }
      res = { set: sinon.stub() }
    })

    it('should set the WWW-Authenticate header with error params', () => {
      const error = {
        error: 'invalid_token',
        error_description: 'Invalid token',
        error_uri: 'https://example.com/errors/token'
      }

      Auth.oidc.setAuthenticateHeader(req, res, error)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'Bearer realm="https://example.com", scope="openid webid", error="invalid_token", error_description="Invalid token", error_uri="https://example.com/errors/token"'
      )
    })

    it('should set WWW-Authenticate with no error_description if none given', () => {
      const error = {}

      Auth.oidc.setAuthenticateHeader(req, res, error)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'Bearer realm="https://example.com", scope="openid webid"'
      )
    })
  })

  describe('isEmptyToken()', () => {
    let req

    beforeEach(() => {
      req = { get: sinon.stub() }
    })

    it('should be true for empty access token', () => {
      req.get.withArgs('Authorization').returns('Bearer ')

      expect(Auth.oidc.isEmptyToken(req)).to.be.true()

      req.get.withArgs('Authorization').returns('Bearer')

      expect(Auth.oidc.isEmptyToken(req)).to.be.true()
    })

    it('should be false when access token is present', () => {
      req.get.withArgs('Authorization').returns('Bearer token123')

      expect(Auth.oidc.isEmptyToken(req)).to.be.false()
    })

    it('should be false when no authorization header is present', () => {
      expect(Auth.oidc.isEmptyToken(req)).to.be.false()
    })
  })
})

describe('WebID-TLS Handler', () => {
  describe('setAuthenticateHeader()', () => {
    let res, req

    beforeEach(() => {
      req = {
        app: {
          locals: { host: { serverUri: 'https://example.com' } }
        }
      }
      res = { set: sinon.stub() }
    })

    it('should set the WWW-Authenticate header', () => {
      Auth.tls.setAuthenticateHeader(req, res)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'WebID-TLS realm="https://example.com"'
      )
    })
  })
})