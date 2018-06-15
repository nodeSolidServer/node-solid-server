'use strict'

const fs = require('fs-extra')
const { LdpFileResource, LdpFileContainer } = require('./ldp-file-resource')

class LdpFileStore {
  /**
   * @param options {object}
   *
   * @param options.root {string} Root fs path for data storage
   * @param options.multiuser {boolean}
   * @param options.suffixAcl {string}
   * @param options.suffixMeta {string}
   * @param options.mapper {LegacyResourceMapper}
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
   * @param target.url {string}
   *
   * @throws {Error} When encountering a filesystem error that's not "File does
   *   not exist", such as `EACCES` etc.
   *
   * @see https://nodejs.org/api/fs.html#fs_class_fs_stats
   *
   * @returns {Promise<LdpFileResource|LdpFileContainer>}
   */
  async resource (target) {
    const { path, contentType: mediaType } = await this.mapper.mapUrlToFile(target)

    let exists = true
    let fsStats

    // Try and load file metadata
    try {
      fsStats = await fs.stat(path)
    } catch (error) {
      if (error.code === 'ENOENT') {
        exists = false
      } else {
        throw error
      }
    }

    let isContainer
    if (exists) {
      isContainer = fsStats.isDirectory()
    } else {
      isContainer = target.url.endsWith('/')
    }

    const encoding = target.charset() // todo: add default charset 'utf8'?

    const options = {target, path, mediaType, encoding, exists, fsStats}

    return isContainer ? new LdpFileContainer(options) : new LdpFileResource(options)
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

  /**
   * Used when trying to delete a container, for example.
   *
   * @param container {LdpFileContainer}
   *
   * @returns {boolean}
   */
  isContainerEmpty (container) {
    const { contents } = container
    let skipCount = 0
    if (contents.indexOf(this.suffixMeta) > -1) {
      skipCount++
    }
    if (contents.indexOf(this.suffixAcl) > -1) {
      skipCount++
    }
    return contents.length === skipCount
  }

  /**
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise}
   */
  async loadContainerContents (container) {
    container.contents = await fs.readdir(container.path, container.encoding)
  }

  /**
   * @param resource
   *
   * @returns {Promise}
   */
  async deleteResource (resource) {
    return fs.remove(resource.path)
  }

  /**
   * Note: Has `rm -rf` semantics, so you need to enforce proper "don't delete
   * if not empty" semantics in the calling code.
   *
   * @throws {Error}
   *
   * @param container
   *
   * @returns {Promise}
   */
  async deleteContainer (container) {
    return fs.remove(container.path)
  }
}

module.exports = LdpFileStore
