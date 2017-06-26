// Performs a text/n3 patch on a graph

module.exports = patch

const $rdf = require('rdflib')
const debug = require('../../debug').handlers
const error = require('../../http-error')

const PATCH_NS = 'http://example.org/patch#'
const PREFIXES = `PREFIX p: <${PATCH_NS}>\n`

// Patches the given graph
function patch (targetKB, targetURI, patchText) {
  const patchKB = $rdf.graph()
  const target = patchKB.sym(targetURI)

  // Must parse relative to document's base address but patch doc should get diff URI
  // @@@ beware the triples from the patch ending up in the same place
  const patchURI = targetURI + '#patch'

  return parsePatchDocument(targetURI, patchURI, patchText, patchKB)
         .then(patchObject => applyPatch(patchObject, target, targetKB))
}

// Parses the given N3 patch document
function parsePatchDocument (targetURI, patchURI, patchText, patchKB) {
  debug('PATCH -- Parsing patch...')

  // Parse the N3 document into triples
  return new Promise((resolve, reject) => {
    const patchGraph = $rdf.graph()
    $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
    resolve(patchGraph)
  })
  // Query the N3 document for insertions and deletions
  .then(patchGraph => queryForFirstResult(patchGraph, `${PREFIXES}
    SELECT ?insert ?delete WHERE {
      ?patch p:patches <${targetURI}>.
      OPTIONAL { ?patch p:insert ?insert. }
      OPTIONAL { ?patch p:delete ?delete. }
    }`)
  )
  // Return the insertions and deletions as an rdflib patch document
  .then(result => {
    return {
      insert: result['?insert'],
      delete: result['?delete']
    }
  })
}

// Applies the patch to the target graph
function applyPatch (patchObject, target, targetKB) {
  return new Promise((resolve, reject) =>
    targetKB.applyPatch(patchObject, target, (err) => {
      if (err) {
        const message = err.message || err // returns string at the moment
        debug('PATCH FAILED. Returning 409. Message: \'' + message + '\'')
        return reject(error(409, 'Error when applying the patch'))
      }
      resolve(targetKB)
    })
  )
}

// Queries the store with the given SPARQL query and returns the first result
function queryForFirstResult (store, sparql) {
  return new Promise((resolve, reject) => {
    const query = $rdf.SPARQLToQuery(sparql, false, store)
    store.query(query, resolve)
  })
}
