// Parses an application/sparql-update patch

import $rdf from 'rdflib'
import error from '../../http-error.mjs'

// Parses the given SPARQL UPDATE document
export default async function parsePatchDocument (targetURI, patchURI, patchText) {
  const baseURI = patchURI.replace(/#.*/, '')
  try {
    return $rdf.sparqlUpdateParser(patchText, $rdf.graph(), baseURI)
  } catch (err) {
    throw error(400, `Patch document syntax error: ${err}`)
  }
}
