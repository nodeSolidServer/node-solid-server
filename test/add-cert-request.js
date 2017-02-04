'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

// const LDP = require('../lib/ldp')
const SolidHost = require('../lib/models/solid-host')
const AccountManager = require('../lib/models/account-manager')
const AddCertificateRequest = require('../lib/requests/add-cert-request')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AddCertificateRequest', () => {
  describe('fromParams()', () => {
    it('should throw a 401 error if session.userId is missing', () => {
      let multiUser = true
      let options = { host, multiUser, authMethod: 'tls' }
      let accountManager = AccountManager.from(options)

      let req = {
        body: { spkac: '123', webid: 'https://alice.example.com/#me' },
        session: {}
      }
      let res = HttpMocks.createResponse()

      try {
        AddCertificateRequest.fromParams(req, res, accountManager)
      } catch (error) {
        expect(error.status).to.equal(401)
      }
    })
  })

  describe('createRequest()', () => {
    let multiUser = true

    it('should call certificate.generateCertificate()', () => {
      let options = { host, multiUser, authMethod: 'tls' }
      let accountManager = AccountManager.from(options)

      let req = {
        body: { spkac: '123', webid: 'https://alice.example.com/#me' },
        session: {
          userId: 'https://alice.example.com/#me'
        }
      }
      let res = HttpMocks.createResponse()

      let request = AddCertificateRequest.fromParams(req, res, accountManager)
      let certificate = request.certificate

      accountManager.addCertKeyToProfile = sinon.stub()
      request.sendResponse = sinon.stub()
      let certSpy = sinon.stub(certificate, 'generateCertificate').returns(Promise.resolve())

      return AddCertificateRequest.addCertificate(request)
        .then(() => {
          expect(certSpy).to.have.been.calledWith(request.userAccount, host)
        })
    })
  })
})

