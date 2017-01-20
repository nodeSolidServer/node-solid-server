const assert = require('chai').assert
const { getRequestingWebId, verifyDelegator } = require('../lib/handlers/allow')
const rdf = require('rdflib')
const ns = require('solid-namespace')(rdf)

const alice = 'https://alice.com'  // principal
const agentWebId = 'https://agent.example.com'  // secretary

const verifiedSecretaryGraph = rdf.graph()
verifiedSecretaryGraph.add(
    rdf.namedNode(alice),
    ns.acl('delegates'),
    rdf.namedNode(agentWebId)
  )
const notVerifiedSecretaryGraph = rdf.graph()

describe('handlers/allow.js', () => {
  describe('getRequestingWebId()', () => {
    const emptyFetchDocument = () => {}

    it('should return null if no webId and no onBehalfOf present', () => {
      let webId  // no secretary
      let onBehalfOf  // no principal

      return getRequestingWebId(webId, onBehalfOf, emptyFetchDocument)
        .then(userId => {
          assert.equal(userId, null,
            'Should return null when no webId is present')
        })
    })

    it('should throw an error if onBehalfOf but no webId', done => {
      let webId  // no secretary
      let onBehalfOf = alice  // principal

      getRequestingWebId(webId, onBehalfOf, emptyFetchDocument)
        .catch(err => {
          assert.equal(err.status, 400)
          done()
        })
    })

    it('should return the webId if no delegation header present', () => {
      let webId = alice  // principal
      let onBehalfOf  // no delegation header

      return getRequestingWebId(webId, onBehalfOf, emptyFetchDocument)
        .then(userId => {
          assert.equal(webId, userId,
            'Should return webId when no onBehalfOf is present')
        })
    })

    it('should return principal (onBehalfOf) if secretary is verified', () => {
      let webId = agentWebId  // secretary
      let onBehalfOf = alice  // principal
      let fetchDocument = (url, callback) => {
        callback(null, verifiedSecretaryGraph)
      }
      return getRequestingWebId(webId, onBehalfOf, fetchDocument)
        .then(userId => {
          assert.equal(userId, alice,
            'Should return principal (onBehalfOf) if secretary is verified')
        })
    })

    it('returns webId if secretary is NOT verified', () => {
      let webId = agentWebId  // secretary
      let onBehalfOf = alice  // principal
      let fetchDocument = (url, callback) => {
        callback(null, notVerifiedSecretaryGraph)
      }
      return getRequestingWebId(webId, onBehalfOf, fetchDocument)
        .then(userId => {
          assert.equal(userId, agentWebId,
            'Should return the webId (secretary id) if secretary is NOT verified')
        })
    })
  })

  describe('verifyDelegator()', () => {
    it("should return true if principal's profile authorizes secretary", () => {
      let secretary = agentWebId
      let principal = alice
      let fetchDocument = (url, callback) => {
        callback(null, verifiedSecretaryGraph)
      }
      return verifyDelegator(secretary, principal, fetchDocument)
        .then(verified => {
          assert.equal(verified, true,
            'Should be true if profile authorizes the secretary')
        })
    })

    it("should return false if principal's profile does NOT authorize secretary", () => {
      let secretary = agentWebId
      let principal = alice
      let fetchDocument = (url, callback) => {
        callback(null, notVerifiedSecretaryGraph)
      }
      return verifyDelegator(secretary, principal, fetchDocument)
        .then(verified => {
          assert.equal(verified, false,
            'Should be false if profile does not authorize the secretary')
        })
    })
  })
})
