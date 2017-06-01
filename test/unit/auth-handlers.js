'use strict'
const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai
chai.use(require('sinon-chai'))
chai.should()

const Auth = require('../../lib/api/authn')

describe('OIDC Handler', () => {
  describe('setAuthenticateHeader()', () => {
    it('should set the WWW-Authenticate header with error params', () => {
      let error = {
        error: 'invalid_token',
        error_description: 'Invalid token',
        error_uri: 'https://example.com/errors/token'
      }
      let locals = {
        host: { serverUri: 'https://example.com' }
      }
      let res = {
        set: sinon.stub()
      }

      Auth.oidc.setAuthenticateHeader(error, locals, res)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'Bearer realm="https://example.com", scope="openid", error="invalid_token", error_description="Invalid token", error_uri="https://example.com/errors/token"'
      )
    })

    it('should set WWW-Authenticate with no error_description if none given', () => {
      let error = {}
      let locals = {
        host: { serverUri: 'https://example.com' }
      }
      let res = {
        set: sinon.stub()
      }

      Auth.oidc.setAuthenticateHeader(error, locals, res)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'Bearer realm="https://example.com", scope="openid"'
      )
    })
  })
})

describe('WebID-TLS Handler', () => {
  describe('setAuthenticateHeader()', () => {
    it('should set the WWW-Authenticate header', () => {
      let locals = {
        host: { serverUri: 'https://example.com' }
      }
      let res = {
        set: sinon.stub()
      }

      Auth.tls.setAuthenticateHeader(locals, res)

      expect(res.set).to.be.calledWith(
        'WWW-Authenticate',
        'WebID-TLS realm="https://example.com"'
      )
    })
  })
})
