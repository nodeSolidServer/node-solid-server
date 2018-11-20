// Parses a text/n3 patch

module.exports = parsePatchDocument

const $rdf = require('rdflib')
const error = require('../../http-error')

const PATCH_NS = 'http://www.w3.org/ns/solid/terms#'
const PREFIXES = `PREFIX solid: <${PATCH_NS}>\n`

// Parses the given N3 patch document
async function parsePatchDocument (targetURI, patchURI, patchText) {
  // Parse the N3 document into triples
  const patchGraph = $rdf.graph()
  try {
    $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
  } catch (err) {
    throw error(400, `Patch document syntax error: ${err}`)
  }

  // Query the N3 document for insertions and deletions
  let firstResult
  try {
    firstResult = await queryForFirstResult(patchGraph, `${PREFIXES}
    SELECT ?insert ?delete ?where WHERE {
      ?patch solid:patches <${targetURI}>.
      OPTIONAL { ?patch solid:inserts ?insert. }
      OPTIONAL { ?patch solid:deletes ?delete. }
      OPTIONAL { ?patch solid:where   ?where.  }
    }`)
  } catch (err) {
    throw error(400, `No patch for ${targetURI} found.`, err)
  }

  // Return the insertions and deletions as an rdflib patch document
  const {'?insert': insert, '?delete': deleted, '?where': where} = firstResult
  if (!insert && !deleted) {
    throw error(400, 'Patch should at least contain inserts or deletes.')
  }
  return {insert, delete: deleted, where}
}

// Queries the store with the given SPARQL query and returns the first result
function queryForFirstResult (store, sparql) {
  return new Promise((resolve, reject) => {
    const query = $rdf.SPARQLToQuery(sparql, false, store)
    store.query(query, resolve, null, () => reject(new Error('No results.')))
  })
}
