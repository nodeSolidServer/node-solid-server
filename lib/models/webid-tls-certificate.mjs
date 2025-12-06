import * as webidTls from '../webid/tls/index.mjs'
import forge from 'node-forge'
import * as utils from '../utils.mjs'

class WebIdTlsCertificate {
  constructor (options = {}) {
    this.spkac = options.spkac
    this.date = options.date || new Date()
    this.webId = options.webId
    this.commonName = options.commonName
    this.issuer = { commonName: options.issuerName }
    this.certificate = null
  }

  static fromSpkacPost (spkac, userAccount, host) {
    if (!spkac) {
      const error = new TypeError('Missing spkac parameter')
      error.status = 400
      throw error
    }
    const date = new Date()
    const commonName = `${userAccount.displayName} [on ${host.serverUri}, created ${date}]`
    const options = {
      spkac: WebIdTlsCertificate.prepPublicKey(spkac),
      webId: userAccount.webId,
      date,
      commonName,
      issuerName: host.serverUri
    }
    return new WebIdTlsCertificate(options)
  }

  static prepPublicKey (spkac) {
    if (!spkac) { return null }
    spkac = utils.stripLineEndings(spkac)
    spkac = Buffer.from(spkac, 'utf-8')
    return spkac
  }

  generateCertificate () {
    const certOptions = {
      spkac: this.spkac,
      agent: this.webId,
      commonName: this.commonName,
      issuer: this.issuer
    }
    return new Promise((resolve, reject) => {
      webidTls.generate(certOptions, (err, certificate) => {
        if (err) {
          reject(err)
        } else {
          this.certificate = certificate
          resolve(this)
        }
      })
    })
  }

  get keyUri () {
    if (!this.webId) {
      const error = new TypeError('Cannot construct key URI, WebID is missing')
      error.status = 400
      throw error
    }
    const profileUri = this.webId.split('#')[0]
    return profileUri + '#key-' + this.date.getTime()
  }

  get exponent () {
    if (!this.certificate) {
      const error = new TypeError('Cannot return exponent, certificate has not been generated')
      error.status = 400
      throw error
    }
    return this.certificate.publicKey.e.toString()
  }

  get modulus () {
    if (!this.certificate) {
      const error = new TypeError('Cannot return modulus, certificate has not been generated')
      error.status = 400
      throw error
    }
    return this.certificate.publicKey.n.toString(16).toUpperCase()
  }

  toDER () {
    if (!this.certificate) {
      return null
    }
    const certificateAsn = forge.pki.certificateToAsn1(this.certificate)
    const certificateDer = forge.asn1.toDer(certificateAsn).getBytes()
    return certificateDer
  }
}

export default WebIdTlsCertificate
