'use strict'

class LdpFileResource {
  /**
   * @param target {LdpTarget}
   * @param path {string} Full file path
   * @param mediaType {string}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean}
   * @param fsStats {fs.Stats}
   */
  constructor ({target, path, mediaType, encoding, exists, fsStats}) {
    this.target = target
    this.path = path
    this.mediaType = mediaType
    this.encoding = encoding
    this.exists = exists
    this.fsStats = fsStats
    this.isContainer = false
  }
}

class LdpFileContainer extends LdpFileResource {
  /**
   * @param options {object} See LdpFileResource constructor docstring
   *
   * @param [options.contents=[]] {Array<string>} Directory file contents
   */
  constructor (options) {
    super(options)

    this.isContainer = true
    this.contents = options.contents || []
  }
}

module.exports = {
  LdpFileResource,
  LdpFileContainer
}
