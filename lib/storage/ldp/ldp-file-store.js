'use strict'

const path = require('path')
const fs = require('fs-extra')
const { LdpFileResource, LdpFileContainer } = require('./ldp-file-resource')
const LdpTarget = require('../../api/ldp/ldp-target')

const AVAILABLE_CHARSETS = ['utf8']

class LdpFileStore {
  /**
   * @param options {object}
   *
   * @param options.fs {object} Expects the `fs-extra` API
   * @param options.mapper {LegacyResourceMapper}
   *
   * @param options.suffixAcl {string}
   * @param options.suffixMeta {string}
   */
  constructor (options) {
    this.fs = options.fs || fs
    this.mapper = options.mapper

    this.suffixAcl = options.suffixAcl
    this.suffixMeta = options.suffixMeta
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
    const { path, contentType: mediaType } = await this.mapper.mapUrlToFile({ url: target.url })

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

    const encoding = target.charset(AVAILABLE_CHARSETS)

    const options = {target, path, mediaType, encoding, exists, fsStats}

    const resource = isContainer
      ? new LdpFileContainer(options)
      : new LdpFileResource(options)
    resource.normalizeUrl()

    return resource
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
    const { resourceNames } = container
    let skipCount = 0
    if (resourceNames.indexOf(this.suffixMeta) > -1) {
      skipCount++
    }
    if (resourceNames.indexOf(this.suffixAcl) > -1) {
      skipCount++
    }
    return resourceNames.length === skipCount
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
   * Load the list of resources in a container (just the file names).
   *
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<string>>}
   */
  async loadContentsList (container) {
    // todo: sort out encoding. Currently, conneg is returning '*' as encoding,
    // which results in an error from readdir
    return this.fs.readdir(container.path) //, container.encoding)
  }

  /**
   * Gets the details on each resource in a container's resource list
   *
   * @param container {LdpFileContainer}
   *
   * @throws {Error}
   *
   * @returns {Promise<Array<LdpFileResource|LdpFileContainer>>}
   */
  async loadContentsDetails (container) {
    return Promise.all(
      container.resourceUrls.map(resource => {
        const [ name, url ] = resource
        return this.resource(new LdpTarget({name, url}))
      })
    )
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

  async readFile (resource) {
    return this.fs.readFile(resource.path, 'utf8')
  }
}

module.exports = LdpFileStore
