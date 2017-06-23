module.exports = patch

var $rdf = require('rdflib')
var debug = require('../../debug').handlers

function patch (targetKB, filename, targetURI, text, callback) {
  debug('PATCH -- parsing query ...')
  var patchURI = targetURI // @@@ beware the triples from the patch ending up in the same place
  var patchKB = $rdf.graph()
  var query = $rdf.SPARQLToQuery(text, false, patchKB, patchURI) // last param not used ATM

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
    const result = {
      'head': {
        'vars': query.vars.map(function (v) {
          return v.toNT()
        })
      },
      'results': {
        'bindings': bindingsArray
      }
    }
    callback(null, JSON.stringify(result))
  }

  var fetcher = new $rdf.Fetcher(targetKB, 10000, true)
  targetKB.query(query, onBindings, fetcher, onDone)
}
