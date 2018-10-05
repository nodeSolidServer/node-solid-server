'use strict'

const { resolve } = require('url')

const DEFAULT_ENCODING = 'utf8'

class LdpFileResource {
  /**
   * @param target {LdpTarget}
   * @param path {string} Full file path
   * @param mediaType {string}
   * @param encoding {string} Either charset (e.g. 'utf8') or 'buffer'
   * @param exists {boolean} Does resource exist on the file system
   * @param fsStats {fs.Stats}
   */
  constructor ({target, path, mediaType, encoding, exists, fsStats}) {
    this.target = target
    this.path = path
    this.mediaType = mediaType
    this.encoding = encoding || DEFAULT_ENCODING
    this.exists = exists
    this.fsStats = fsStats
    this.isContainer = false
  }

  normalizeUrl () {
    // Do nothing (is overridden in subclass)
  }
}

class LdpFileContainer extends LdpFileResource {
  /**
   * @param options {object} See LdpFileResource constructor docstring
   *
   * @param [options.resourceNames=[]] {Array<string>} Directory file contents
   * @param [options.resources=[]] {Array<LdpFileResource|LdpFileContainer>} List of
   *   LdpFileResource instances. Each requires an fs.stats() call, so initializing
   *   this is an expensive operation. See `LdpFileStore.loadContentsDetails()`
   */
  constructor (options) {
    super(options)

    this.isContainer = true
    this.resourceNames = options.resourceNames || []
    this.resources = options.resources || []
  }

  get resourceUrls () {
    return this.resourceNames.map((name) => [name, resolve(this.target.url, name)])
  }

  normalizeUrl () {
    if (!this.path.endsWith('/')) {
      this.path += '/'
    }

    if (!this.target.url.endsWith('/')) {
      this.target.url += '/'
    }

    if (!this.target.name.endsWith('/')) {
      this.target.name += '/'
    }
  }
}

module.exports = {
  LdpFileResource,
  LdpFileContainer
}
