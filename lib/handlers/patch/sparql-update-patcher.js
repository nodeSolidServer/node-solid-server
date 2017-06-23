// Performs an application/sparql-update patch on a graph

module.exports = patch

const $rdf = require('rdflib')
const debug = require('../../debug').handlers
const error = require('../../http-error')

// Patches the given graph
function patch (targetKB, targetURI, patchText) {
  return new Promise((resolve, reject) => {
    // Parse the patch document
    debug('PATCH -- Parsing patch...')
    const patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
    const patchKB = $rdf.graph()
    var patchObject
    try {
      // Must parse relative to document's base address but patch doc should get diff URI
      patchObject = $rdf.sparqlUpdateParser(patchText, patchKB, patchURI)
    } catch (e) {
      return reject(error(400, 'Patch format syntax error:\n' + e + '\n'))
    }
    debug('PATCH -- reading target file ...')

    // Apply the patch to the target graph
    var target = patchKB.sym(targetURI)
    targetKB.applyPatch(patchObject, target, function (err) {
      if (err) {
        var message = err.message || err // returns string at the moment
        debug('PATCH FAILED. Returning 409. Message: \'' + message + '\'')
        return reject(error(409, 'Error when applying the patch'))
      }
      resolve(targetKB)
    })
  })
}
