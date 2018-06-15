'use strict'

class LdpFileResource {
  /**
   * @param target {LdpTarget}
   * @param filePath {string}
   */
  constructor ({target, filePath}) {
    this.target = target
    this.filePath = filePath
  }
}

module.exports = LdpFileResource
