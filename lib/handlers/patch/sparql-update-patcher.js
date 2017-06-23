module.exports = patch

var mime = require('mime-types')
var fs = require('fs')
var $rdf = require('rdflib')
var debug = require('../../debug').handlers
var error = require('../../http-error')

const DEFAULT_CONTENT_TYPE = 'text/turtle'

function patch (targetKB, filename, targetURI, text, callback) {
  var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
  var patchKB = $rdf.graph()
  var targetContentType = mime.lookup(filename) || DEFAULT_CONTENT_TYPE

  debug('PATCH -- parsing patch ...')
  var patchObject
  try {
    // Must parse relative to document's base address but patch doc should get diff URI
    patchObject = $rdf.sparqlUpdateParser(text, patchKB, patchURI)
  } catch (e) {
    return callback(error(400, 'Patch format syntax error:\n' + e + '\n'))
  }
  debug('PATCH -- reading target file ...')

  var target = patchKB.sym(targetURI)
  targetKB.applyPatch(patchObject, target, function (err) {
    if (err) {
      var message = err.message || err // returns string at the moment
      debug('PATCH FAILED. Returning 409. Message: \'' + message + '\'')
      return callback(error(409, 'Error when applying the patch'))
    }
    debug('PATCH -- Patched. Writeback URI base ' + targetURI)
    var data = $rdf.serialize(target, targetKB, targetURI, targetContentType)
    // debug('Writeback data: ' + data)

    fs.writeFile(filename, data, {encoding: 'utf8'}, function (err, data) {
      if (err) {
        return callback(error(500, 'Failed to write file back after patch: ' + err))
      }
      debug('PATCH -- applied OK (sync)')
      return callback(null, 'Patch applied OK\n')
    })
  })
}
