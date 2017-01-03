const fs = require('fs-extra')
const error = require('./http-error')
const debug = require('./debug')
const path = require('path')

class LdpResource {
  /**
   * @constructor
   * @param hostname {string}
   * @param resourcePath {string}
   * @param [options={}] {Object}
   * @param [options.filename] {string}
   * @param [options.fileExists] {Boolean}
   * @param [options.fileStats] {fs.Stats}
   * @param [options.store] {LdpFileStore}
   */
  constructor (hostname, resourcePath, options = {}) {
    this.hostname = hostname
    this.resourcePath = resourcePath
    this.filename = options.filename
    this.fileExists = options.fileExists
    this.fileStats = options.fileStats
    this.store = options.store
  }

  /**
   * Factory method
   * @method from
   *
   * @param hostname {string}
   * @param resourcePath {string}
   * @param [options={}] {Object}
   * @param [options.filename] {string}
   * @param [options.fileStats] {fs.Stats}
   * @param [options.store] {LdpFileStore}
   * @return {LdpResource|LdpContainer}
   */
  static from (hostname, resourcePath, options = {}) {
    let isDirectory

    if (options.fileStats) {
      isDirectory = options.fileStats.isDirectory()
      options.fileExists = true
    } else {
      isDirectory = options.filename && options.filename.endsWith('/')
    }

    let resource
    if (isDirectory) {
      resource = new LdpContainer(hostname, resourcePath, options)
    } else {
      resource = new LdpResource(hostname, resourcePath, options)
    }
    resource.normalizeResourcePath()
    return resource
  }

  get isContainer () {
    return false
  }

  normalizeResourcePath () {
    if (this.resourcePath && this.resourcePath.endsWith('/')) {
      this.resourcePath = this.resourcePath.slice(0, -1)
    }
  }
}

class LdpContainer extends LdpResource {
  get isContainer () {
    return true
  }

  normalizeResourcePath () {
    if (this.resourcePath && !this.resourcePath.endsWith('/')) {
      this.resourcePath += '/'
    }
  }
}

class LdpFileStore {
  /**
   *
   * @param options
   * @param options.rootPath
   * @param options.idp
   * @param options.suffixAcl
   * @param options.suffixMeta
   */
  constructor (options = {}) {
    this.rootPath = options.rootPath
    if (!this.rootPath) {
      throw error(500, 'LdpFileStore requires a root path parameter')
    }
    this.idp = options.idp
    this.suffixAcl = options.suffixAcl
    this.suffixMeta = options.suffixMeta
  }

  /**
   * @method stat
   * @param filePath {string}
   * @returns {Promise<fs.Stats>}
   */
  stat (filePath) {
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          return reject(this.fsError(err, filePath))
        }
        resolve(stats)
      })
    })
  }

  /**
   * @method createDirectory
   * @param resource {LdpResource}
   * @throws {HttpError}
   * @return {Promise<LdpResource>} Returns the resource when `mkdir -p` succeeds
   */
  createDirectory (resource) {
    let dirName = path.dirname(resource.filename)
    return new Promise((resolve, reject) => {
      fs.mkdirp(dirName, (err) => {
        if (err) {
          return reject(this.fsError(err, dirName))
        }
        resolve(resource)
      })
    })
  }

  /**
   * @method createWriteStream
   * @param resource {LdpResource}
   * @param stream
   * @throws {HttpError}
   * @return {Promise<LdpResource>} Returns the resource when the write stream
   *   sends the `finish` event
   */
  createWriteStream (resource, stream) {
    return new Promise((resolve, reject) => {
      let file = stream.pipe(fs.createWriteStream(resource.filename))
      file.on('error', (err) => {
        err.status = 500
        reject(error(err, `Error creating a write stream: ${err}`))
      })
      file.on('finish', () => {
        resolve(resource)
      })
    })
  }

  /**
   * @param err {Error}
   * @param filename {string}
   * @return {HttpError}
   */
  fsError (err, filename) {
    if (err.code === 'ENOENT') {
      return error(404, `File path not found: ${filename}`)
    } else {
      return error(500, `Filesystem error accessing ${filename}: ${err}`)
    }
  }

  /**
   * @method delete
   * @param hostname {string}
   * @param resourcePath {string}
   * @throws {HTTPError}
   * @return {Promise}
   */
  delete (hostname, resourcePath) {
    return this.findResource(hostname, resourcePath)
      .then(resource => {
        if (!resource.fileExists) {
          throw error(404, 'Resource not found')
        }
        if (resource.isContainer()) {
          return this.deleteContainer(resource)
        } else {
          return this.deleteResource(resource)
        }
      })
  }

  /**
   * @param container {LdpContainer}
   * @returns {Promise}
   */
  deleteContainer (container) {
    let directory = container.filename
    return new Promise((resolve, reject) => {
      fs.readdir(directory, (err, list) => {
        if (err) {
          return reject(this.fsError(err, directory))
        }
        if (!this.isEmpty(directory, list)) {
          return reject(error(409, 'Container is not empty'))
        }
        fs.remove(directory, (err) => {
          if (err) {
            return reject(this.fsError(err, directory))
          }
          resolve()
        })
      })
    })
  }

  /**
   * @param resource {LdpResource}
   * @returns {Promise}
   */
  deleteResource (resource) {
    let filename = resource.filename
    return new Promise((resolve, reject) => {
      fs.remove(filename, (err) => {
        if (err) {
          return reject(this.fsError(err, filename))
        }
        resolve()
      })
    })
  }

  isEmpty (directory, list) {
    let skipCount = 0
    if (list.indexOf(this.suffixMeta) > -1) {
      skipCount++
    }
    if (list.indexOf(this.suffixAcl) > -1) {
      skipCount++
    }
    return list.length === skipCount
  }

  /**
   * @method put
   * @param hostname {string}
   * @param resourcePath {string}
   * @param stream
   * @throws {HttpError}
   * @returns {Promise}
   */
  put (hostname, resourcePath, stream) {
    return this.findResource(hostname, resourcePath)
      .then(resource => {
        if (resource.isContainer()) {
          throw error(409, 'PUT not supported on containers, use POST instead')
        }
        // First, create the enclosing directory, if necessary
        return this.createDirectory(resource)
      })
      .catch(err => {
        debug.handlers('PUT -- Error creating directory: ' + err)
        err.status = 500
        throw error(err, 'Failed to create the path to the new resource')
      })
      .then(resource => {
        // Directory created, now write the file
        return this.createWriteStream(resource, stream)
      })
      .catch(err => {
        debug.handlers('PUT -- Error writing data: ' + err)
        throw err
      })
      .then(resource => {
        debug.handlers('PUT -- Wrote data to: ' + resource.filename)
        return resource
      })
  }

  /**
   * @method findResource
   * @param hostname {string}
   * @param resourcePath {string}
   * @throws {HttpError}
   * @return {Promise<LdpResource|LdpContainer>}
   */
  findResource (hostname, resourcePath) {
    if (!hostname || !resourcePath) {
      return Promise.reject(error(400, 'Invalid hostname or resource path'))
    }
    let rootPath = this.rootPathFor(hostname)
    // Decode the path, in case there are URI-escaped path segments
    resourcePath = resourcePath.split('/').map(decodeURIComponent).join('/')
    let filename = path.join(rootPath, resourcePath)

    return this.stat(filename)
      .then(fileStats => {
        return LdpResource.from(hostname, resourcePath,
          { filename, fileStats, store: this })
      })
      .catch(err => {
        if (err.status === 404) {
          return LdpResource.from(hostname, resourcePath,
            { filename, store: this })
        } else {
          throw err
        }
      })
  }

  /**
   * @param hostname {string} Request hostname
   * @return {string}
   */
  rootPathFor (hostname) {
    if (!hostname) {
      throw new Error('rootPathFor() is missing the hostname param')
    }
    if (this.idp) {  // multi-user mode
      return `${this.rootPath}${hostname}/`
    } else {  // single-user mode
      return this.rootPath
    }
  }
}

module.exports = LdpFileStore
