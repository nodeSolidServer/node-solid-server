const fs = require('fs')
const URL = require('url')
const { promisify } = require('util')
const { types, extensions } = require('mime-types')
const readdir = promisify(fs.readdir)

const DEFAULT_CONTENTTYPE = 'application/octet-stream'

// A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
// following the principles of the “sweet spot” discussed in
// https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
class ResourceMapper {
  constructor ({ rootUrl, rootPath, includeHost }) {
    this._rootUrl = removeTrailingSlash(rootUrl)
    this._rootPath = removeTrailingSlash(rootPath)
    this._includeHost = includeHost
    this._readdir = readdir

    // If the host needs to be replaced on every call, pre-split the root URL
    if (includeHost) {
      const { protocol, pathname } = URL.parse(rootUrl)
      this._protocol = protocol
      this._rootUrl = removeTrailingSlash(pathname)
    }
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url, contentType, createIfNotExists }) {
    // Split the URL into components
    const { pathname, hostname } = typeof url === 'string' ? URL.parse(url) : url
    if (pathname.indexOf('/..') >= 0) {
      throw new Error('Disallowed /.. segment in URL')
    }

    let path
    const basePath = this.getBasePath(hostname)
    // Create the path for a new file
    if (createIfNotExists) {
      path = `${basePath}${pathname}`
      // If the extension is not correct for the content type, append the correct extension
      if (getContentType(pathname) !== contentType) {
        path += contentType in extensions ? `$.${extensions[contentType][0]}` : '$.unknown'
      }
    // Determine the path of an existing file
    } else {
      // Read all files in the corresponding folder
      const filename = pathname.substr(pathname.lastIndexOf('/') + 1)
      const folder = `${basePath}${pathname.substr(0, pathname.length - filename.length)}`
      const files = await this._readdir(folder)

      // Find a file with the same name (minus the dollar extension)
      const match = files.find(f => removeDollarExtension(f) === filename)
      if (!match) {
        throw new Error('File not found')
      }
      path = `${folder}${match}`
      contentType = getContentType(match)
    }

    return { path, contentType: contentType || DEFAULT_CONTENTTYPE }
  }

  // Maps a given server file to a URL
  async mapFileToUrl ({ path, hostname }) {
    // Determine the URL by chopping off everything after the dollar sign
    const pathname = removeDollarExtension(path.substring(this._rootPath.length))
    const url = `${this.getBaseUrl(hostname)}${pathname}`
    return { url, contentType: getContentType(path) }
  }

  // Gets the base file path for the given hostname
  getBasePath (hostname) {
    return this._includeHost ? `${this._rootPath}/${hostname}` : this._rootPath
  }

  // Gets the base URL for the given hostname
  getBaseUrl (hostname) {
    return this._includeHost ? `${this._protocol}//${hostname}${this._rootUrl}` : this._rootUrl
  }
}

// Removes a possible trailing slash from a path
function removeTrailingSlash (path) {
  const lastPos = path.length - 1
  return lastPos < 0 || path[lastPos] !== '/' ? path : path.substr(0, lastPos)
}

// Removes everything beyond the dollar sign from a path
function removeDollarExtension (path) {
  const dollarPos = path.lastIndexOf('$')
  return dollarPos < 0 ? path : path.substr(0, dollarPos)
}

// Gets the expected content type based on the extension of the path
function getContentType (path) {
  const extension = /\.([^/.]+)$/.exec(path)
  return extension && types[extension[1].toLowerCase()] || DEFAULT_CONTENTTYPE
}

module.exports = ResourceMapper
