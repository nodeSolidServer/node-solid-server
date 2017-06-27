// Performs an application/sparql-update patch on a graph

module.exports = patch

const $rdf = require('rdflib')
const debug = require('../../debug').handlers
const error = require('../../http-error')

// Patches the given graph
function patch (targetKB, targetURI, patchURI, patchText) {
  const patchKB = $rdf.graph()
  const target = patchKB.sym(targetURI)

  return parsePatchDocument(patchURI, patchText, patchKB)
         .then(patchObject => applyPatch(patchObject, target, targetKB))
}

// Parses the given SPARQL UPDATE document
function parsePatchDocument (patchURI, patchText, patchKB) {
  debug('PATCH -- Parsing patch...')
  return new Promise((resolve, reject) => {
    const baseURI = patchURI.replace(/#.*/, '')
    try {
      resolve($rdf.sparqlUpdateParser(patchText, patchKB, baseURI))
    } catch (err) {
      reject(error(400, 'Patch format syntax error:\n' + err + '\n'))
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
