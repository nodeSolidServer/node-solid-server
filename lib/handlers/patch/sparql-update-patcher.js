module.exports = patch

var mime = require('mime-types')
var fs = require('fs')
var $rdf = require('rdflib')
var debug = require('../../debug').handlers
var error = require('../../http-error')
const waterfall = require('run-waterfall')

const DEFAULT_CONTENT_TYPE = 'text/turtle'

function patch (filename, targetURI, text, callback) {
  var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
  var patchKB = $rdf.graph()
  var targetKB = $rdf.graph()
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

  waterfall([
    (cb) => {
      fs.stat(filename, (err) => {
        if (!err) return cb()

        fs.writeFile(filename, '', (err) => {
          if (err) {
            return cb(error(err, 'Error creating the patch target'))
          }
          cb()
        })
      })
    },
    (cb) => {
      fs.readFile(filename, {encoding: 'utf8'}, function (err, dataIn) {
        if (err) {
          return cb(error(500, 'Error reading the patch target'))
        }

        debug('PATCH -- target read OK ' + dataIn.length + ' bytes. Parsing...')

        try {
          $rdf.parse(dataIn, targetKB, targetURI, targetContentType)
        } catch (e) {
          debug('Patch: Target ' + targetContentType + ' file syntax error:' + e)
          return cb(error(500, 'Patch: Target ' + targetContentType + ' file syntax error:' + e))
        }

        var target = patchKB.sym(targetURI)
        debug('PATCH -- Target parsed OK, patching... ')

        targetKB.applyPatch(patchObject, target, function (err) {
          if (err) {
            var message = err.message || err // returns string at the moment
            debug('PATCH FAILED. Returning 409. Message: \'' + message + '\'')
            return cb(error(409, 'Error when applying the patch'))
          }
          debug('PATCH -- Patched. Writeback URI base ' + targetURI)
          var data = $rdf.serialize(target, targetKB, targetURI, targetContentType)
          // debug('Writeback data: ' + data)

          fs.writeFile(filename, data, {encoding: 'utf8'}, function (err, data) {
            if (err) {
              return cb(error(500, 'Failed to write file back after patch: ' + err))
            }
            debug('PATCH -- applied OK (sync)')
            return cb(null, 'Patch applied OK\n')
          })
        })
      })
    }
  ], callback)
}
