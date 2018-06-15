'use strict'

const fs = require('fs-extra')
const LdpFileResource = require('./ldp-file-resource')

class LdpFileStore {
  /**
   * @param options {object}
   *
   * @param options.root {string} Root fs path for data storage
   * @param options.multiuser {boolean}
   * @param options.suffixAcl {string}
   * @param options.suffixMeta {string}
   * @param options.mapper {ResourceMapper}
   * @param options.dataBrowserPath {string}
   * @param options.suppressDataBrowser
   */
  constructor (options) {
    this.root = options.root
    this.multiuser = options.multiuser
    this.suffixAcl = options.suffixAcl
    this.suffixMeta = options.suffixMeta

    this.mapper = options.mapper

    this.dataBrowserPath = options.dataBrowserPath
    this.suppressDataBrowser = options.suppressDataBrowser
  }

  /**
   * @param target {LdpTarget}
   *
   * @returns {Promise<LdpFileResource>}
   */
  async resource (target) {
    const filePath = await this.mapper
      .mapUrlToFile({
        url: target.url, contentType: target.mediaType(), createIfNotExists: true
      })

    return new LdpFileResource({target, filePath})
  }

  /**
   * @param target {LdpTarget}
   *
   * @returns {Promise<boolean>}
   */
  async exists (target) {
    const resource = await this.resource(target)

    return fs.pathExists(resource.filePath)
  }
}

module.exports = LdpFileStore
