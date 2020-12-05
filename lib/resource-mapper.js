/* eslint-disable node/no-deprecated-api, no-mixed-operators */

const fs = require('fs')
const URL = require('url')
const { promisify } = require('util')
const { types, extensions } = require('mime-types')
const readdir = promisify(fs.readdir)
const HTTPError = require('./http-error')
const pathUtil = require('path')

/*
 * A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
 * following the principles of the "sweet spot" discussed in
 * https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
 *
 * This class implements this mapping in a single place
 * such that all components use the exact same logic.
 *
 * There are few public methods, and we STRONGLY suggest not to create more.
 * Exposing too much of the internals would likely give other components
 * too much knowledge about the mapping, voiding the purpose of this class.
 */
class ResourceMapper {
  constructor ({
    rootUrl,
    rootPath,
    includeHost = false,
    defaultContentType = 'application/octet-stream',
    indexFilename = 'index.html',
    overrideTypes = { acl: 'text/turtle', meta: 'text/turtle' }
  }) {
    this._rootUrl = this._removeTrailingSlash(rootUrl)
    this._rootPath = this._removeTrailingSlash(rootPath).replace(/\\/g, '/')
    this._includeHost = includeHost
    this._readdir = readdir
    this._defaultContentType = defaultContentType
    this._types = { ...types, ...overrideTypes }
    this._indexFilename = indexFilename
    this._indexContentType = this._getContentTypeFromExtension(indexFilename)

    // If the host needs to be replaced on every call, pre-split the root URL
    if (includeHost) {
      const { protocol, port, pathname } = URL.parse(rootUrl)
      this._protocol = protocol
      this._port = port === null ? '' : `:${port}`
      this._rootUrl = this._removeTrailingSlash(pathname)
    }
  }

  // Returns the URL of the given HTTP request
  getRequestUrl (req) {
    const { hostname, pathname } = this._parseUrl(req)
    return this.resolveUrl(hostname, pathname)
  }

  // Returns the URL corresponding to the relative path on the pod
  resolveUrl (hostname, pathname = '') {
    return !this._includeHost
      ? `${this._rootUrl}${pathname}`
      : `${this._protocol}//${hostname}${this._port}${this._rootUrl}${pathname}`
  }

  // Returns the file path corresponding to the relative file path on the pod
  resolveFilePath (hostname, filePath = '') {
    return !this._includeHost
      ? `${this._rootPath}${filePath}`
      : `${this._rootPath}/${hostname}${filePath}`
  }

  // Maps a given server file to a URL
  async mapFileToUrl ({ path, hostname }) {
    // Remove the root path if specified
    path = path.replace(/\\/g, '/')
    if (path.startsWith(this._rootPath)) {
      path = path.substring(this._rootPath.length)
    }
    if (this._includeHost) {
      if (!path.startsWith(`/${hostname}/`)) {
        throw new Error(`Path must start with hostname (/${hostname})`)
      }
      path = path.substring(hostname.length + 1)
    }

    // Determine the URL by chopping off everything after the dollar sign
    const pathname = this._removeDollarExtension(path)
    const url = `${this.resolveUrl(hostname)}${
      pathname.split('/').map((component) => encodeURIComponent(component)).join('/')
    }`
    return { url, contentType: this._getContentTypeFromExtension(path) }
  }

  // Maps the request for a given resource and representation format to a server file
  // Will look for an index file if a folder is given and searchIndex is true
  async mapUrlToFile ({ url, contentType, createIfNotExists, searchIndex = true }) {
    // Parse the URL and find the base file path
    const { pathname, hostname } = this._parseUrl(url)
    const filePath = this.resolveFilePath(hostname, decodeURIComponent(pathname))
    if (filePath.indexOf('/..') >= 0) {
      throw new Error('Disallowed /.. segment in URL')
    }
    const isFolder = filePath.endsWith('/')
    const isIndex = searchIndex && filePath.endsWith('/')

    // Create the path for a new resource
    let path
    if (createIfNotExists) {
      path = filePath
      // Append index filename if needed
      if (isIndex) {
        if (contentType !== this._indexContentType) {
          throw new Error(`Index file needs to have ${this._indexContentType} as content type`)
        }
        path += this._indexFilename
      }
      // If the extension is not correct for the content type, append the correct extension
      if (!isFolder) {
        path = this._addContentTypeExtension(path, contentType)
      }
    // Determine the path of an existing file
    } else {
      // Read all files in the corresponding folder
      const filename = filePath.substr(filePath.lastIndexOf('/') + 1)
      const folder = filePath.substr(0, filePath.length - filename.length)

      // Find a file with the same name (minus the dollar extension)
      let match = ''
      if (match === '') { // always true to keep indentation
        const files = await this._readdir(folder)
        // Search for files with the same name (disregarding a dollar extension)
        if (!isFolder) {
          match = files.find(f => this._removeDollarExtension(f) === filename)
        // Check if the index file exists
        } else if (searchIndex && files.includes(this._indexFilename)) {
          match = this._indexFilename
        }
      }
      // Error if no match was found (unless URL ends with '/', then fall back to the folder)
      if (match === undefined) {
        if (isIndex) {
          match = ''
        } else {
          throw new HTTPError(404, `Resource not found: ${pathname}`)
        }
      }
      path = `${folder}${match}`
      contentType = this._getContentTypeFromExtension(match)
    }
    return { path, contentType: contentType || this._defaultContentType }
  }

  // Parses a URL into hostname and pathname
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
  _getContentTypeFromExtension (path) {
    const extension = /\.([^/.]+)$/.exec(path)
    return extension && this._types[extension[1].toLowerCase()] || this._defaultContentType
  }

  // Appends an extension for the specific content type, if needed
  _addContentTypeExtension (path, contentType) {
    // If we would guess the wrong content type from the extension, try appending a better one
    const contentTypeFromExtension = this._getContentTypeFromExtension(path)
    if (contentTypeFromExtension !== contentType) {
      // Some extensions fit multiple content types, so only switch if there's an improvement
      const newExtension = contentType in extensions ? extensions[contentType][0] : 'unknown'
      if (this._types[newExtension] !== contentTypeFromExtension) {
        path += `$.${newExtension}`
      }
    }
    return path
  }

  // Removes possible trailing slashes from a path
  _removeTrailingSlash (path) {
    return path.replace(/\/+$/, '')
  }

  // Removes dollar extensions from files (index$.html becomes index)
  _removeDollarExtension (path) {
    return path.replace(/\$\.[^$]*$/, '')
  }
}

module.exports = ResourceMapper
