const fs = require('fs-extra')
const error = require('./http-error')
const debug = require('./debug')
const path = require('path')

class LDPFileStore {
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
      throw error(500, 'LDPFileStore requires a root path parameter')
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
   * @param dirName {string}
   * @throws {HttpError}
   * @return {Promise} Resolves when `mkdir -p` succeeds
   */
  createDirectory (dirName) {
    return new Promise((resolve, reject) => {
      fs.mkdirp(dirName, (err) => {
        if (err) {
          return reject(this.fsError(err, dirName))
        }
        resolve()
      })
    })
  }

  /**
   * @method createWriteStream
   * @param filePath
   * @param stream
   * @returns {Promise} Resolves when the write stream sends the `finish` event
   */
  createWriteStream (filePath, stream) {
    return new Promise((resolve, reject) => {
      let file = stream.pipe(fs.createWriteStream(filePath))
      file.on('error', (err) => {
        err.status = 500
        reject(error(err, `Error creating a write stream: ${err}`))
      })
      file.on('finish', () => {
        resolve()
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
   * @method filenameFor
   * @param host {string}
   * @param resourcePath {string}
   * @return {string}
   */
  filenameFor (host, resourcePath) {
    let rootPath = this.rootPathFor(host)
    return this.uriToFilename(resourcePath, rootPath)
  }

  /**
   * @method delete
   * @param host {string}
   * @param resourcePath {string}
   * @throws {HTTPError}
   * @return {Promise}
   */
  delete (host, resourcePath) {
    let filename
    try {
      filename = this.filenameFor(host, resourcePath)
    } catch (err) {
      err.status = 500
      return Promise.reject(err)
    }

    return this.stat(filename)
      .then(fileStats => {
        if (fileStats.isDirectory()) {
          return this.deleteContainer(filename)
        } else {
          return this.deleteResource(filename)
        }
      })
  }

  deleteContainer (directory) {
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

  deleteResource (filename) {
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
    let countValid = 0
    if (list.indexOf(this.suffixMeta) > -1) {
      countValid++
    }
    if (list.indexOf(this.suffixAcl) > -1) {
      countValid++
    }
    return list.length === countValid
  }

  /**
   * @method put
   * @param host {string}
   * @param resourcePath {string}
   * @param stream
   * @throws {HttpError}
   * @returns {Promise}
   */
  put (host, resourcePath, stream) {
    let filePath
    try {
      filePath = this.filenameFor(host, resourcePath)
    } catch (err) {
      err.status = 500
      return Promise.reject(err)
    }
    // PUT requests not supported on containers. Use POST instead
    if (filePath.endsWith('/')) {
      return Promise.reject(
        error(409, 'PUT not supported on containers, use POST instead')
      )
    }
    // First, create the enclosing directory, if necessary
    var dirName = path.dirname(filePath)
    return this.createDirectory(dirName)
      .catch(err => {
        debug.handlers('PUT -- Error creating directory: ' + err)
        throw error(err, 'Failed to create the path to the new resource')
      })
      .then(() => {
        // Directory created, now write the file
        return this.createWriteStream(filePath, stream)
      })
      .catch(err => {
        debug.handlers('PUT -- Error writing data: ' + err)
        throw err
      })
      .then(() => {
        debug.handlers('PUT -- Wrote data to: ' + filePath)
      })
  }

  /**
   * @param host {string} Request hostname
   * @return {string}
   */
  rootPathFor (host) {
    if (!host) {
      throw new Error('rootPathFor() is missing the host param')
    }
    if (this.idp) {  // multi-user mode
      return `${this.rootPath}${host}/`
    } else {  // single-user mode
      return this.rootPath
    }
  }

  uriToFilename (uri, base) {
    let decoded = uri.split('/').map(decodeURIComponent).join('/')
    let filename = path.join(base, decoded)
    // Make sure filename ends with '/'  if filename exists and is a directory.
    // TODO this sync operation can be avoided and can be left
    // to do, to other components, see `ldp.get`
    try {
      let fileStats = fs.statSync(filename)
      if (fileStats.isDirectory() && !filename.endsWith('/')) {
        filename += '/'
      } else if (fileStats.isFile() && filename.endsWith('/')) {
        filename = filename.slice(0, -1)
      }
    } catch (err) {}
    return filename
  }
}

module.exports = LDPFileStore
