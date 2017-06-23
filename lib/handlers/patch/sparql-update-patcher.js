module.exports = patch

var $rdf = require('rdflib')
var debug = require('../../debug').handlers
var error = require('../../http-error')

function patch (targetKB, filename, targetURI, text) {
  return new Promise((resolve, reject) => {
    var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
    var patchKB = $rdf.graph()

    debug('PATCH -- parsing patch ...')
    var patchObject
    try {
      // Must parse relative to document's base address but patch doc should get diff URI
      patchObject = $rdf.sparqlUpdateParser(text, patchKB, patchURI)
    } catch (e) {
      return reject(error(400, 'Patch format syntax error:\n' + e + '\n'))
    }
    debug('PATCH -- reading target file ...')

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
