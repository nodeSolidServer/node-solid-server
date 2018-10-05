'use strict'

const { resolve } = require('url')

class LdpTarget {
  /**
   * @param url {string} Fully qualified url, with protocol etc
   * @param [name] {string} Filename part of the url (req.path)
   * @param [conneg] {Negotiator} Content type negotiator instance
   */
  constructor ({url, name, conneg}) {
    this.url = url
    this.name = name
    this.isAcl = this.name.endsWith('.acl') // todo: pass in the .acl suffix
    this.conneg = conneg
  }

  get isContainer () {
    return this.url.endsWith('/')
  }

  charset () {
    return (this.conneg && this.conneg.charset()) || undefined
  }

  mediaType () {
    return (this.conneg && this.conneg.mediaType()) || undefined
  }

  get isRoot () {
    return this.name === '/'
  }

  get parent () {
    if (this.isRoot) { return null }

    return this.isContainer ? resolve(this.url, '..') : resolve(this.url, '.')
  }
}

module.exports = LdpTarget
