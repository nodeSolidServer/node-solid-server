'use strict'

class LdpTarget {
  /**
   * @param url {string}
   * @param conneg {Negotiator} Content type negotiator instance
   */
  constructor ({url, conneg}) {
    this.url = url
    this.conneg = conneg
  }

  get isContainer () {
    return this.url.endsWith('/')
  }

  charset () {
    return this.conneg.charset()
  }

  mediaType () {
    return this.conneg.mediaType()
  }
}

module.exports = LdpTarget
