import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import path from 'path'
import rdf from 'rdflib'
import solidNamespace from 'solid-namespace'
import chai from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import HttpMocks from 'node-mocks-http'

import SolidHost from '../../lib/models/solid-host.mjs'
import AccountManager from '../../lib/models/account-manager.mjs'
import AddCertificateRequest from '../../lib/requests/add-cert-request.mjs'
import WebIdTlsCertificate from '../../lib/models/webid-tls-certificate.mjs'

const { expect } = chai
const ns = solidNamespace(rdf)
chai.use(sinonChai)
chai.should()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const exampleSpkac = fs.readFileSync(
  path.join(__dirname, '../../test/resources/example_spkac.cnf'), 'utf8'
)

let host

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
