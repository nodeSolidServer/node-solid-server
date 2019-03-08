const fs = require('fs')
const URL = require('url')
const { promisify } = require('util')
const { types, extensions } = require('mime-types')
const readdir = promisify(fs.readdir)
const HTTPError = require('./http-error')

// A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
// following the principles of the “sweet spot” discussed in
// https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
class ResourceMapper {
  constructor ({
    rootUrl,
    rootPath,
    includeHost = false,
    defaultContentType = 'application/octet-stream',
    indexFilename = 'index.html',
    overrideTypes = { acl: 'text/turtle', meta: 'text/turtle' },
    fileSuffixes = ['.acl', '.meta']
  }) {
    this._rootUrl = this._removeTrailingSlash(rootUrl)
    this._rootPath = this._removeTrailingSlash(rootPath)
    this._includeHost = includeHost
    this._readdir = readdir
    this._defaultContentType = defaultContentType
    this._types = { ...types, ...overrideTypes }
    this._indexFilename = indexFilename
    this._indexContentType = this._getContentTypeByExtension(indexFilename)
    this._isControlFile = new RegExp(`(?:${fileSuffixes.map(fs => fs.replace('.', '\\.')).join('|')})$`)

    // If the host needs to be replaced on every call, pre-split the root URL
    if (includeHost) {
      const { protocol, port, pathname } = URL.parse(rootUrl)
      this._protocol = protocol
      this._port = port === null ? '' : `:${port}`
      this._rootUrl = this._removeTrailingSlash(pathname)
    }
  }

  get rootPath () {
    return this._rootPath
  }

  // Maps the request for a given resource and representation format to a server file
  // When searchIndex is true and the URL ends with a '/', indexFilename will be matched.
  async mapUrlToFile ({ url, contentType, createIfNotExists, searchIndex = true }) {
    let fullPath = this.getFullPath(url)
    let isIndex = searchIndex && fullPath.endsWith('/')
    let path

    // Append index filename if the URL ends with a '/'
    if (isIndex) {
      if (createIfNotExists && contentType !== this._indexContentType) {
        throw new Error(`Index file needs to have ${this._indexContentType} as content type`)
      }
      fullPath += this._indexFilename
    }

    // Create the path for a new file
    if (createIfNotExists) {
      path = fullPath
      // If the extension is not correct for the content type, append the correct extension
      if (searchIndex && this._getContentTypeByExtension(path) !== contentType) {
        path += `$${contentType in extensions ? `.${extensions[contentType][0]}` : '.unknown'}`
      }
    // Determine the path of an existing file
    } else {
      // Read all files in the corresponding folder
      const filename = fullPath.substr(fullPath.lastIndexOf('/') + 1)
      const folder = fullPath.substr(0, fullPath.length - filename.length)

      // Find a file with the same name (minus the dollar extension)
      let match = searchIndex ? await this._getMatchingFile(folder, filename, isIndex) : ''
      if (match === undefined) {
        // Error if no match was found,
        // unless the URL ends with a '/',
        // in that case we fallback to the folder itself.
        if (isIndex) {
          match = ''
        } else {
          throw new HTTPError(404, `File not found: ${fullPath}`)
        }
      }
      path = `${folder}${match}`
      contentType = this._getContentTypeByExtension(match)
    }

    return { path, contentType: contentType || this._defaultContentType }
  }

  async _getMatchingFile (folder, filename, isIndex) {
    const files = await this._readdir(folder)
    // Search for files with the same name (disregarding a dollar extension)
    if (!isIndex) {
      return files.find(f => this._removeDollarExtension(f) === filename)
    // Check if the index file exists
    } else if (files.includes(this._indexFilename)) {
      return this._indexFilename
    }
  }

  async getRepresentationUrlForResource (resourceUrl) {
    let fullPath = this.getFullPath(resourceUrl)
    let isIndex = fullPath.endsWith('/')

    // Append index filename if the URL ends with a '/'
    if (isIndex) {
      fullPath += this._indexFilename
    }

    // Read all files in the corresponding folder
    const filename = fullPath.substr(fullPath.lastIndexOf('/') + 1)
    const folder = fullPath.substr(0, fullPath.length - filename.length)
    const files = await this._readdir(folder)

    // Find a file with the same name (minus the dollar extension)
    let match = (files.find(f => this._removeDollarExtension(f) === filename || (isIndex && f.startsWith(this._indexFilename + '.'))))
    return `${resourceUrl}${match || ''}`
  }

  // Maps a given server file to a URL
  async mapFileToUrl ({ path, hostname }) {
    // Determine the URL by chopping off everything after the dollar sign
    let pathname = this._removeDollarExtension(path.substring(this._rootPath.length))
    pathname = this._replaceBackslashes(pathname)
    const url = `${this.resolveUrl(hostname)}${encodeURI(pathname)}`
    return { url, contentType: this._getContentTypeByExtension(path) }
  }

  // Gets the base file path for the given hostname
  getBasePath (hostname) {
    return !this._includeHost ? this._rootPath : `${this._rootPath}/${hostname}`
  }

  // Resolve a URL for the given hostname
  // Optionally, a pathname may be passed that will be appended to the baseUrl.
  resolveUrl (hostname, pathname = '') {
    return !this._includeHost ? `${this._rootUrl}${pathname}`
      : `${this._protocol}//${hostname}${this._port}${this._rootUrl}${pathname}`
  }

  // Determine the full file path corresponding to a URL
  getFullPath (url) {
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
    return extension && this._types[extension[1].toLowerCase()] || this._defaultContentType
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

  _replaceBackslashes (path) {
    return path.replace(/\\/g, '/')
  }
}

module.exports = ResourceMapper
