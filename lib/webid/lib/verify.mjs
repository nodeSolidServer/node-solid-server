import $rdf from 'rdflib'
import get from './get.mjs'
import parse from './parse.mjs'

const Graph = $rdf.graph
const SPARQL_QUERY = 'PREFIX cert: <http://www.w3.org/ns/auth/cert#> SELECT ?webid ?m ?e WHERE { ?webid cert:key ?key . ?key cert:modulus ?m . ?key cert:exponent ?e . }'

export function verify (certificateObj, callback) {
  if (!certificateObj) {
    return callback(new Error('No certificate given'))
  }
  const uris = getUris(certificateObj)
  if (uris.length === 0) {
    return callback(new Error('Empty Subject Alternative Name field in certificate'))
  }
  const uri = uris.shift()
  get(uri, function (err, body, contentType) {
    if (err) {
      return callback(err)
    }
    verifyKey(certificateObj, uri, body, contentType, function (err, success) {
      return callback(err, uri)
    })
  })
}

function getUris (certificateObj) {
  const uris = []
  if (certificateObj && certificateObj.subjectaltname) {
    certificateObj.subjectaltname.replace(/URI:([^, ]+)/g, function (match, uri) {
      return uris.push(uri)
    })
  }
  return uris
}

export function verifyKey (certificateObj, uri, profile, contentType, callback) {
  const graph = new Graph()
  let found = false
  if (!certificateObj.modulus) {
    return callback(new Error('Missing modulus value in client certificate'))
  }
  if (!certificateObj.exponent) {
    return callback(new Error('Missing exponent value in client certificate'))
  }
  if (!contentType) {
    return callback(new Error('No value specified for the Content-Type header'))
  }
  const mimeType = contentType.replace(/;.*/, '')
  parse(profile, graph, uri, mimeType, function (err) {
    if (err) {
      return callback(err)
    }
    const certExponent = parseInt(certificateObj.exponent, 16).toString()
    const query = $rdf.SPARQLToQuery(SPARQL_QUERY, undefined, graph)
    graph.query(
      query,
      function (result) {
        if (found) {
          return
        }
        const modulus = result['?m'].value
        const exponent = result['?e'].value
        if (modulus != null && exponent != null && (modulus.toLowerCase() === certificateObj.modulus.toLowerCase()) && exponent === certExponent) {
          found = true
        }
      },
      undefined,
      function () {
        if (!found) {
          return callback(new Error("Certificate public key not found in the user's profile"))
        }
        return callback(null, true)
      }
    )
  })
}
