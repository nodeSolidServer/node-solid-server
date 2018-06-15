'use strict'

const path = require('path')
const { LdpFileResource, LdpFileContainer } = require('./ldp-file-resource')

class LdpFileStore {
  /**
   * @param options {object}
   *
   * @param options.fs {object} Expects the `fs-extra` API
   * @param options.mapper {LegacyResourceMapper}
   *
   * @param options.suffixAcl {string}
   * @param options.suffixMeta {string}
   * @param options.dataBrowserPath {string}
   * @param options.suppressDataBrowser {boolean}
   */
  constructor (options) {
    this.fs = options.fs
    this.mapper = options.mapper

    this.suffixAcl = options.suffixAcl
    this.suffixMeta = options.suffixMeta
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
   * @see https://nodejs.org/api/this.fs.html#fs_class_fs_stats
   *
   * @returns {Promise<LdpFileResource|LdpFileContainer>}
   */
  async resource (target) {
    const { path, contentType: mediaType } = await this.mapper.mapUrlToFile(target)

    let exists = true
    let fsStats

    // Try and load file metadata
    try {
      fsStats = await this.fs.stat(path)
    } catch (error) {
      if (error.code === 'ENOENT') {
        exists = false
      } else {
        throw error
      }
    }

    const isContainer = fsStats ? fsStats.isDirectory() : target.url.endsWith('/')

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

    return this.fs.pathExists(resource.filePath)
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

  async createContainer (container) {
    return this.fs.ensureDir(container.path)
  }

  async createResource (resource, bodyStream) {
    await this.fs.ensureDir(path.dirname(resource.path))

    return this.createWriteStream(resource, bodyStream)
  }

  /**
   * @param resource {LdpFileResource}
   * @param bodyStream {Stream}
   *
   * @throws {HttpError}
   *
   * @return {Promise<LdpFileResource>} Returns the resource when the write stream
   *   sends the `finish` event
   */
  async createWriteStream (resource, bodyStream) {
    return new Promise((resolve, reject) => {
      const fileStream = this.fs.createWriteStream(
        resource.path, { encoding: resource.encoding }
      )
      let writeStream = bodyStream.pipe(fileStream)

      writeStream.on('error', (error) => {
        reject(new Error(`Error creating a write stream: ${error}`))
      })
      writeStream.on('finish', () => {
        resolve(resource)
      })
    })
  }

  /**
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise}
   */
  async loadContainerContents (container) {
    container.contents = await this.fs.readdir(container.path, container.encoding)
  }

  /**
   * @param resource
   *
   * @returns {Promise}
   */
  async deleteResource (resource) {
    return this.fs.remove(resource.path)
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
    return this.fs.remove(container.path)
  }
}

module.exports = LdpFileStore
