// Parses an application/sparql-update patch

module.exports = parsePatchDocument

const $rdf = require('rdflib')
const error = require('../../http-error')

// Parses the given SPARQL UPDATE document
function parsePatchDocument (targetURI, patchURI, patchText) {
  return new Promise((resolve, reject) => {
    const baseURI = patchURI.replace(/#.*/, '')
    try {
      resolve($rdf.sparqlUpdateParser(patchText, $rdf.graph(), baseURI))
    } catch (err) {
      reject(error(400, `Patch document syntax error: ${err}`))
    }
  })
}
