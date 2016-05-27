'use strict'

const chai = require('chai')
const expect = chai.expect

const {
  authCodeFlowCallback,
  getIssuerId
} = require('../../lib/api/authn/webid-oidc')

describe('/handlers/auth-webid-oidc', () => {
  describe('authCodeFlowCallback()', () => {
    it('throws a 400 error if no issuer_id present', done => {
      let oidc = {}
      let req = { params: {} }
      authCodeFlowCallback(oidc, req)
        .catch(err => {
          expect(err.status).to.equal(400)
          done()
        })
    })
  })

  describe('getIssuerId()', () => {
    it('should return falsy when no req.params present', () => {
      expect(getIssuerId()).to.not.exist
    })

    it('should return falsy when req.params.issuer_id is absent', () => {
      expect(getIssuerId()).to.not.exist
    })

    it('should uri-decode issuer_id', () => {
      let req = {
        params: {
          issuer_id: 'https%3A%2F%2Flocalhost'
        }
      }
      expect(getIssuerId(req)).to.equal('https://localhost')
    })
  })
})
