const assert = require('chai').assert
const { getUserId, verifyDelegator } = require('../lib/handlers/allow')
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

describe('allow() handler', () => {
  describe('getUserId()', () => {
    const emptyFetchDocument = () => {}
    it('no webId present', done => {
      let webId  // no secretary
      let onBehalfOf = alice  // principal
      getUserId(webId, onBehalfOf, emptyFetchDocument)
        .then(userId => {
          assert.equal(userId, undefined,
            'Should return undefined when no webId is present')
          done()
        })
    })
    it('no onBehalfOf present', done => {
      let webId = alice  // principal
      let onBehalfOf  // no delegation header
      getUserId(webId, onBehalfOf, emptyFetchDocument)
        .then(userId => {
          assert.equal(webId, userId,
            'Should return webId when no onBehalfOf is present')
          done()
        })
    })
    it('throws 500 error if fetchDocument errors', done => {
      let webId = agentWebId  // secretary
      let onBehalfOf = alice  // principal
      let fetchDocument = (url, callback) => {
        callback(new Error('Some error while fetching'), null)
      }
      getUserId(webId, onBehalfOf, fetchDocument)
        .catch(err => {
          assert.equal(err.status, 500)
          done()
        })
    })
    it('returns principal (onBehalfOf) if secretary is verified', done => {
      let webId = agentWebId  // secretary
      let onBehalfOf = alice  // principal
      let fetchDocument = (url, callback) => {
        callback(null, verifiedSecretaryGraph)
      }
      getUserId(webId, onBehalfOf, fetchDocument)
        .then(userId => {
          assert.equal(userId, alice,
            'Should return principal (onBehalfOf) if secretary is verified')
          done()
        })
        .catch(err => {
          console.error(err)
        })
    })
    it('returns webId if secretary is NOT verified', done => {
      let webId = agentWebId  // secretary
      let onBehalfOf = alice  // principal
      let fetchDocument = (url, callback) => {
        callback(null, notVerifiedSecretaryGraph)
      }
      getUserId(webId, onBehalfOf, fetchDocument)
        .then(userId => {
          assert.equal(userId, agentWebId,
            'Should return the webId (secretary id) if secretary is NOT verified')
          done()
        })
        .catch(err => {
          console.error(err)
        })
    })
  })

  describe('verifyDelegator()', () => {
    it('should throw 500 error if fetchDocument errors', done => {
      let secretary, principal
      let fetchDocument = (url, callback) => {
        callback(new Error('Some error while fetching'), null)
      }
      verifyDelegator(secretary, principal, fetchDocument)
        .catch(err => {
          assert.equal(err.status, 500)
          done()
        })
    })
    it("should return true if principal's profile authorizes secretary", done => {
      let secretary = agentWebId
      let principal = alice
      let fetchDocument = (url, callback) => {
        callback(null, verifiedSecretaryGraph)
      }
      verifyDelegator(secretary, principal, fetchDocument)
        .then(verified => {
          assert.equal(verified, true,
            'Should be true if profile authorizes the secretary')
          done()
        })
        .catch(err => {
          console.error(err)
        })
    })
    it("should return false if principal's profile does NOT authorize secretary", done => {
      let secretary = agentWebId
      let principal = alice
      let fetchDocument = (url, callback) => {
        callback(null, notVerifiedSecretaryGraph)
      }
      verifyDelegator(secretary, principal, fetchDocument)
        .then(verified => {
          assert.equal(verified, false,
            'Should be false if profile does not authorize the secretary')
          done()
        })
        .catch(err => {
          console.error(err)
        })
    })
  })
})
