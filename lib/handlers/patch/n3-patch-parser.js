// Parses a text/n3 patch

module.exports = parsePatchDocument

const $rdf = require('rdflib')
const error = require('../../http-error')

const PATCH_NS = 'http://example.org/patch#'
const PREFIXES = `PREFIX p: <${PATCH_NS}>\n`

// Parses the given N3 patch document
function parsePatchDocument (targetURI, patchURI, patchText) {
  // Parse the N3 document into triples
  return new Promise((resolve, reject) => {
    const patchGraph = $rdf.graph()
    $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
    resolve(patchGraph)
  })
  .catch(err => { throw error(400, `Patch document syntax error: ${err}`) })

  // Query the N3 document for insertions and deletions
  .then(patchGraph => queryForFirstResult(patchGraph, `${PREFIXES}
    SELECT ?insert ?delete ?where WHERE {
      ?patch p:patches <${targetURI}>.
      OPTIONAL { ?patch p:insert ?insert. }
      OPTIONAL { ?patch p:delete ?delete. }
      OPTIONAL { ?patch p:where  ?where.  }
    }`)
    .catch(err => { throw error(400, `No patch for ${targetURI} found.`, err) })
  )

  // Return the insertions and deletions as an rdflib patch document
  .then(result => {
    const {'?insert': insert, '?delete': deleted, '?where': where} = result
    if (!insert && !deleted) {
      throw error(400, 'Patch should at least contain inserts or deletes.')
    }
    return {insert, delete: deleted, where}
  })
}

// Queries the store with the given SPARQL query and returns the first result
function queryForFirstResult (store, sparql) {
  return new Promise((resolve, reject) => {
    const query = $rdf.SPARQLToQuery(sparql, false, store)
    store.query(query, resolve, null, () => reject(new Error('No results.')))
  })
}
