const fs = require('fs-extra')
const error = require('./http-error')
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
   * @param host {string}
   * @param resourcePath {string}
   * @throws {HTTPError}
   * @return {Promise}
   */
  delete (host, resourcePath) {
    let rootPath = this.rootPathFor(host)
    let filename = this.uriToFilename(resourcePath, rootPath)

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
          console.log('Error in deleteResource: ', err)
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
