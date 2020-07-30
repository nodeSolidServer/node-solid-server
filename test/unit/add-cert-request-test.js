'use strict'
/* eslint-disable no-unused-expressions */

const fs = require('fs-extra')
const path = require('path')
const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()
const HttpMocks = require('node-mocks-http')

const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const AddCertificateRequest = require('../../lib/requests/add-cert-request')
const WebIdTlsCertificate = require('../../lib/models/webid-tls-certificate')

const exampleSpkac = fs.readFileSync(
  path.join(__dirname, '../resources/example_spkac.cnf'), 'utf8'
)

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AddCertificateRequest', () => {
  describe('fromParams()', () => {
    it('should throw a 401 error if session.userId is missing', () => {
      const multiuser = true
      const options = { host, multiuser, authMethod: 'oidc' }
      const accountManager = AccountManager.from(options)

      const req = {
        body: { spkac: '123', webid: 'https://alice.example.com/#me' },
        session: {}
      }
      const res = HttpMocks.createResponse()

      try {
        AddCertificateRequest.fromParams(req, res, accountManager)
      } catch (error) {
        expect(error.status).to.equal(401)
      }
    })
  })

  describe('createRequest()', () => {
    const multiuser = true

    it('should call certificate.generateCertificate()', () => {
      const options = { host, multiuser, authMethod: 'oidc' }
      const accountManager = AccountManager.from(options)

      const req = {
        body: { spkac: '123', webid: 'https://alice.example.com/#me' },
        session: {
          userId: 'https://alice.example.com/#me'
        }
      }
      const res = HttpMocks.createResponse()

      const request = AddCertificateRequest.fromParams(req, res, accountManager)
      const certificate = request.certificate

      accountManager.addCertKeyToProfile = sinon.stub()
      request.sendResponse = sinon.stub()
      const certSpy = sinon.stub(certificate, 'generateCertificate').returns(Promise.resolve())

      return AddCertificateRequest.addCertificate(request)
        .then(() => {
          expect(certSpy).to.have.been.called
        })
    })
  })

  describe('accountManager.addCertKeyToGraph()', () => {
    const multiuser = true

    it('should add certificate data to a graph', () => {
      const options = { host, multiuser, authMethod: 'oidc' }
      const accountManager = AccountManager.from(options)

      const userData = { username: 'alice' }
      const userAccount = accountManager.userAccountFrom(userData)

      const certificate = WebIdTlsCertificate.fromSpkacPost(
        decodeURIComponent(exampleSpkac),
        userAccount,
        host)

      const graph = rdf.graph()

      return certificate.generateCertificate()
        .then(() => {
          return accountManager.addCertKeyToGraph(certificate, graph)
        })
        .then(graph => {
          const webId = rdf.namedNode(certificate.webId)
          const key = rdf.namedNode(certificate.keyUri)

          expect(graph.anyStatementMatching(webId, ns.cert('key'), key))
            .to.exist
          expect(graph.anyStatementMatching(key, ns.rdf('type'), ns.cert('RSAPublicKey')))
            .to.exist
          expect(graph.anyStatementMatching(key, ns.cert('modulus')))
            .to.exist
          expect(graph.anyStatementMatching(key, ns.cert('exponent')))
            .to.exist
        })
    })
  })
})
