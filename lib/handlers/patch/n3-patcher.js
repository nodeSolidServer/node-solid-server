// Performs a text/n3 patch on a graph

module.exports = patch

const $rdf = require('rdflib')
const debug = require('../../debug').handlers
const error = require('../../http-error')

const PATCH_NS = 'http://example.org/patch#'
const PREFIXES = `PREFIX p: <${PATCH_NS}>\n`

// Patches the given graph
function patch (targetKB, targetURI, patchURI, patchText) {
  const patchKB = $rdf.graph()
  const target = patchKB.sym(targetURI)

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
  .catch(err => { throw error(400, `Invalid patch document: ${err}`) })

  // Query the N3 document for insertions and deletions
  .then(patchGraph => queryForFirstResult(patchGraph, `${PREFIXES}
    SELECT ?insert ?delete WHERE {
      ?patch p:patches <${targetURI}>.
      OPTIONAL { ?patch p:insert ?insert. }
      OPTIONAL { ?patch p:delete ?delete. }
    }`)
    .catch(err => { throw error(400, `No patch for ${targetURI} found.`, err) })
  )

  // Return the insertions and deletions as an rdflib patch document
  .then(result => {
    const inserts = result['?insert']
    const deletes = result['?delete']
    if (!inserts && !deletes) {
      throw error(400, 'Patch should at least contain inserts or deletes.')
    }
    return {insert: inserts, delete: deletes}
  })
}

// Applies the patch to the target graph
function applyPatch (patchObject, target, targetKB) {
  return new Promise((resolve, reject) =>
    targetKB.applyPatch(patchObject, target, (err) => {
      if (err) {
        const message = err.message || err // returns string at the moment
        debug('PATCH FAILED. Returning 409. Message: \'' + message + '\'')
        return reject(error(409, `The patch could not be applied. ${message}`))
      }
      resolve(targetKB)
    })
  )
}

// Queries the store with the given SPARQL query and returns the first result
function queryForFirstResult (store, sparql) {
  return new Promise((resolve, reject) => {
    const query = $rdf.SPARQLToQuery(sparql, false, store)
    store.query(query, resolve, null, () => reject(new Error('No results.')))
  })
}
