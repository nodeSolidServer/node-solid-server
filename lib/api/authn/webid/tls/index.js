exports.verify = verify
exports.generate = generate
exports.verifyKey = verifyKey

const $rdf = require('rdflib')
const get = require('../lib/get')
const parse = require('../lib/parse')
const forge = require('node-forge')
const url = require('url')
const crypto = require('crypto')
const certificate = new crypto.Certificate()
const pki = forge.pki
const Graph = $rdf.graph
const SPARQL_QUERY = 'PREFIX cert: <http://www.w3.org/ns/auth/cert#> SELECT ?webid ?m ?e WHERE { ?webid cert:key ?key . ?key cert:modulus ?m . ?key cert:exponent ?e . }'

function verify (certificate, callback) {
  if (!certificate) {
    return callback(new Error('No certificate given'))
  }

  // Collect URIs in certificate
  const uris = getUris(certificate)

  // No uris
  if (uris.length === 0) {
    return callback(new Error('Empty Subject Alternative Name field in certificate'))
  }

  // Get first URI
  const uri = uris.shift()
  get(uri, function (err, body, contentType) {
    if (err) {
      return callback(err)
    }

    // Verify Key
    verifyKey(certificate, uri, body, contentType, function (err, success) {
      return callback(err, uri)
    })
  })
}

function getUris (certificate) {
  const uris = []

  if (certificate && certificate.subjectaltname) {
    certificate
      .subjectaltname
      .replace(/URI:([^, ]+)/g, function (match, uri) {
        return uris.push(uri)
      })
  }
  return uris
}

function verifyKey (certificate, uri, profile, contentType, callback) {
  const graph = new Graph()
  let found = false

  if (!certificate.modulus) {
    return callback(new Error('Missing modulus value in client certificate'))
  }

  if (!certificate.exponent) {
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
    const certExponent = parseInt(certificate.exponent, 16).toString()
    const query = $rdf.SPARQLToQuery(SPARQL_QUERY, undefined, graph)
    graph.query(
      query,
      function (result) {
        if (found) {
          return
        }
        const modulus = result['?m'].value
        const exponent = result['?e'].value

        if (modulus != null &&
           exponent != null &&
           (modulus.toLowerCase() === certificate.modulus.toLowerCase()) &&
           exponent === certExponent) {
          found = true
        }
      },
      undefined, // testing
      function () {
        if (!found) {
          return callback(new Error('Certificate public key not found in the user\'s profile'))
        }
        return callback(null, true)
      }
    )
  })
}

function generate (options, callback) {
  if (!options.agent) {
    return callback(new Error('No agent uri found'))
  }
  if (!options.spkac) {
    return callback(new Error('No public key found'), null)
  }
  if (!certificate.verifySpkac(Buffer.from(options.spkac))) {
    return callback(new Error('Invalid SPKAC'))
  }
  options.duration = options.duration || 10

  // Generate a new certificate
  const cert = pki.createCertificate()
  cert.serialNumber = (Date.now()).toString(16)

  // Get fields from SPKAC to populate new cert
  const publicKey = certificate.exportPublicKey(options.spkac).toString()
  cert.publicKey = pki.publicKeyFromPem(publicKey)

  // Validity of 10 years
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + options.duration)

  // `.` is default with the OpenSSL command line tool
  const commonName = options.commonName || url.URL(options.agent).hostname
  const attrsSubject = [{
    name: 'commonName',
    value: commonName
  }, {
    name: 'organizationName',
    value: options.organizationName || 'WebID'
  }]

  const attrsIssuer = [{
    name: 'commonName',
    value: commonName
  }, {
    name: 'organizationName',
    value: options.organizationName || 'WebID'
  }]

  if (options.issuer) {
    if (options.issuer.commonName) {
      attrsIssuer[0].value = options.issuer.commonName
    }
    if (options.issuer.organizationName) {
      attrsIssuer[1].value = options.issuer.organizationName
    }
  }

  // Set same fields for certificate and issuer
  cert.setSubject(attrsSubject)
  cert.setIssuer(attrsIssuer)

  // Set the cert extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
      critical: true
    }, {
      name: 'subjectAltName',
      altNames: [{
        type: 6, // URI
        value: options.agent
      }]
    }, {
      name: 'subjectKeyIdentifier'
    }
  ])

  // Generate a new keypair to sign the certificate
  // TODO this make is not really "self-signed"
  const keys = pki.rsa.generateKeyPair(1024)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return callback(null, cert)
}
