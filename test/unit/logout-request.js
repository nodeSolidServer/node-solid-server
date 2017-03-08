'use strict'

const chai = require('chai')
const expect = chai.expect
const HttpMocks = require('node-mocks-http')

const LogoutRequest = require('../../lib/requests/logout-request')

describe('LogoutRequest', () => {
  it('should clear user session properties', () => {
    let req = {
      session: {
        userId: 'https://alice.example.com/#me',
        identified: true,
        accessToken: {},
        refreshToken: {},
        subject: {}
      }
    }
    let res = HttpMocks.createResponse()

    return LogoutRequest.handle(req, res)
      .then(() => {
        let session = req.session
        expect(session.userId).to.be.empty
      })
  })

  it('should redirect to /goodbye', () => {
    let req = { session: {} }
    let res = HttpMocks.createResponse()

    return LogoutRequest.handle(req, res)
      .then(() => {
        expect(res.statusCode).to.equal(302)
        expect(res._getRedirectUrl()).to.equal('/goodbye')
      })
  })
})
