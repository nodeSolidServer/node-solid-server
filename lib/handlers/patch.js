module.exports = handler

var mime = require('mime')
mime.default_type = 'text/turtle'
var fs = require('fs')
var $rdf = require('rdflib')
var debug = require('../debug').handlers
var utils = require('../utils.js')
var error = require('../http-error')
const waterfall = require('run-waterfall')

function handler (req, res, next) {
  req.setEncoding('utf8')
  req.text = ''
  req.on('data', function (chunk) {
    req.text += chunk
  })

  req.on('end', function () {
    patchHandler(req, res, next)
  })
}

function patchHandler (req, res, next) {
  var ldp = req.app.locals.ldp
  debug('PATCH -- ' + req.originalUrl)
  debug('PATCH -- text length: ' + (req.text ? req.text.length : 'undefined2'))
  res.header('MS-Author-Via', 'SPARQL')

  var root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  var filename = utils.uriToFilename(req.path, root)
  var targetContentType = mime.lookup(filename)
  var patchContentType = req.get('content-type').split(';')[0].trim() // Ignore parameters
  var targetURI = utils.uriAbs(req) + req.originalUrl

  debug('PATCH -- Content-type ' + patchContentType + ' patching target ' + targetContentType + ' <' + targetURI + '>')

  if (patchContentType === 'application/sparql') {
    sparql(filename, targetURI, req.text, function (err, result) {
      if (err) {
        return next(err)
      }
      res.json(result)
      return next()
    })
  } else if (patchContentType === 'application/sparql-update') {
    return sparqlUpdate(filename, targetURI, req.text, function (err, patchKB) {
      if (err) {
        return next(err)
      }

      // subscription.publishDelta(req, res, patchKB, targetURI)
      debug('PATCH -- applied OK (sync)')
      res.send('Patch applied OK\n')
      return next()
    })
  } else {
    return next(error(400, 'Unknown patch content type: ' + patchContentType))
  }
} // postOrPatch

function sparql (filename, targetURI, text, callback) {
  debug('PATCH -- parsing query ...')
  var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
  var patchKB = $rdf.graph()
  var targetKB = $rdf.graph()
  var targetContentType = mime.lookup(filename)
  var query = $rdf.SPARQLToQuery(text, false, patchKB, patchURI) // last param not used ATM

  fs.readFile(filename, {encoding: 'utf8'}, function (err, dataIn) {
    if (err) {
      return callback(error(404, 'Patch: Original file read error:' + err))
    }

    debug('PATCH -- File read OK ' + dataIn.length)
    debug('PATCH -- parsing target file ...')

    try {
      $rdf.parse(dataIn, targetKB, targetURI, targetContentType)
    } catch (e) {
      debug('Patch: Target ' + targetContentType + ' file syntax error:' + e)
      return callback(error(500, 'Patch: Target ' + targetContentType + ' file syntax error:' + e))
    }
    debug('PATCH -- Target parsed OK ')

    var bindingsArray = []

    var onBindings = function (bindings) {
      var b = {}
      var v
      var x
      for (v in bindings) {
        if (bindings.hasOwnProperty(v)) {
          x = bindings[v]
          b[v] = x.uri ? {'type': 'uri', 'value': x.uri} : { 'type': 'literal', 'value': x.value }
          if (x.lang) {
            b[v]['xml:lang'] = x.lang
          }
          if (x.dt) {
            b[v].dt = x.dt.uri  // @@@ Correct? @@ check
          }
        }
      }
      debug('PATCH -- bindings: ' + JSON.stringify(b))
      bindingsArray.push(b)
    }

    var onDone = function () {
      debug('PATCH -- Query done, no. bindings: ' + bindingsArray.length)
      return callback(null, {
        'head': {
          'vars': query.vars.map(function (v) {
            return v.toNT()
          })
        },
        'results': {
          'bindings': bindingsArray
        }
      })
    }

    var fetcher = new $rdf.Fetcher(targetKB, 10000, true)
    targetKB.query(query, onBindings, fetcher, onDone)
  })
}

function sparqlUpdate (filename, targetURI, text, callback) {
  var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
  var patchKB = $rdf.graph()
  var targetKB = $rdf.graph()
  var targetContentType = mime.lookup(filename)

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
        if (err) {
          fs.writeFile(filename, '', cb)
        } else {
          cb(err)
        }
      })
    },
    (cb) => {
      fs.readFile(filename, {encoding: 'utf8'}, function (err, dataIn) {
        if (err) {
          return cb(error(404, 'Error reading the patch target'))
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
            return cb(null, patchKB)
          })
        })
      })
    }
  ], callback)
}
