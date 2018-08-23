const fs = require('fs')
const URL = require('url')
const { promisify } = require('util')
const { types, extensions } = require('mime-types')
const readdir = promisify(fs.readdir)

// A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
// following the principles of the “sweet spot” discussed in
// https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
class ResourceMapper {
  constructor ({
    rootUrl = 'https://localhost:8443/',
    rootPath = '/tmp/',
    includeHost = false,
    defaultContentType = 'application/octet-stream'
  }) {
    this._rootUrl = this._removeTrailingSlash(rootUrl)
    this._rootPath = this._removeTrailingSlash(rootPath)
    this._includeHost = includeHost
    this._readdir = readdir
    this._defaultContentType = defaultContentType

    // If the host needs to be replaced on every call, pre-split the root URL
    if (includeHost) {
      const { protocol, port, pathname } = URL.parse(rootUrl)
      this._protocol = protocol
      this._port = port === null ? '' : `:${port}`
      this._rootUrl = this._removeTrailingSlash(pathname)
    }
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url, contentType, createIfNotExists }) {
    const fullPath = this._getFullPath(url)
    let path

    // Create the path for a new file
    if (createIfNotExists) {
      path = fullPath
      // If the extension is not correct for the content type, append the correct extension
      if (this._getContentTypeByExtension(path) !== contentType) {
        path += contentType in extensions ? `$.${extensions[contentType][0]}` : '$.unknown'
      }
    // Determine the path of an existing file
    } else {
      // Read all files in the corresponding folder
      const filename = fullPath.substr(fullPath.lastIndexOf('/') + 1)
      const folder = fullPath.substr(0, fullPath.length - filename.length)
      const files = await this._readdir(folder)

      // Find a file with the same name (minus the dollar extension)
      const match = files.find(f => this._removeDollarExtension(f) === filename)
      if (!match) {
        throw new Error('File not found')
      }
      path = `${folder}${match}`
      contentType = this._getContentTypeByExtension(match)
    }

    return { path, contentType: contentType || this._defaultContentType }
  }

  // Maps a given server file to a URL
  async mapFileToUrl ({ path, hostname }) {
    // Determine the URL by chopping off everything after the dollar sign
    const pathname = this._removeDollarExtension(path.substring(this._rootPath.length))
    const url = `${this.getBaseUrl(hostname)}${encodeURI(pathname)}`
    return { url, contentType: this._getContentTypeByExtension(path) }
  }

  // Gets the base file path for the given hostname
  getBasePath (hostname) {
    return !this._includeHost ? this._rootPath : `${this._rootPath}/${hostname}`
  }

  // Gets the base URL for the given hostname
  getBaseUrl (hostname) {
    return !this._includeHost ? this._rootUrl
                              : `${this._protocol}//${hostname}${this._port}${this._rootUrl}`
  }

  // Determine the full file path corresponding to a URL
  _getFullPath (url) {
    const { pathname, hostname } = this._parseUrl(url)
    const fullPath = decodeURIComponent(`${this.getBasePath(hostname)}${pathname}`)
    if (fullPath.indexOf('/..') >= 0) {
      throw new Error('Disallowed /.. segment in URL')
    }
    return fullPath
  }

  // Parses a URL into a hostname and pathname
  _parseUrl (url) {
    // URL specified as string
    if (typeof url === 'string') {
      return URL.parse(url)
    }
    // URL specified as Express request object
    if (!url.pathname && url.path) {
      const { hostname, path } = url
      return { hostname, pathname: path.replace(/[?#].*/, '') }
    }
    // URL specified as object
    return url
  }

  // Gets the expected content type based on the extension of the path
  _getContentTypeByExtension (path) {
    const extension = /\.([^/.]+)$/.exec(path)
    return extension && types[extension[1].toLowerCase()] || this._defaultContentType
  }

  // Removes a possible trailing slash from a path
  _removeTrailingSlash (path) {
    const lastPos = path.length - 1
    return lastPos < 0 || path[lastPos] !== '/' ? path : path.substr(0, lastPos)
  }

  // Removes everything beyond the dollar sign from a path
  _removeDollarExtension (path) {
    const dollarPos = path.lastIndexOf('$')
    return dollarPos < 0 ? path : path.substr(0, dollarPos)
  }
}

module.exports = ResourceMapper
