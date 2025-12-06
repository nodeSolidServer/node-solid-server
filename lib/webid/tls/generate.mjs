import forge from 'node-forge'
import { URL } from 'url'
import crypto from 'crypto'

const certificate = new crypto.Certificate()
const pki = forge.pki

export function generate (options, callback) {
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
  const cert = pki.createCertificate()
  cert.serialNumber = (Date.now()).toString(16)
  const publicKey = certificate.exportPublicKey(options.spkac).toString()
  cert.publicKey = pki.publicKeyFromPem(publicKey)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + options.duration)
  const commonName = options.commonName || new URL(options.agent).hostname
  const attrsSubject = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: options.organizationName || 'WebID' }
  ]
  const attrsIssuer = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: options.organizationName || 'WebID' }
  ]
  if (options.issuer) {
    if (options.issuer.commonName) {
      attrsIssuer[0].value = options.issuer.commonName
    }
    if (options.issuer.organizationName) {
      attrsIssuer[1].value = options.issuer.organizationName
    }
  }
  cert.setSubject(attrsSubject)
  cert.setIssuer(attrsIssuer)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'subjectAltName', altNames: [{ type: 6, value: options.agent }] },
    { name: 'subjectKeyIdentifier' }
  ])
  const keys = pki.rsa.generateKeyPair(1024)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return callback(null, cert)
}
