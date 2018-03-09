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
  constructor ({ rootUrl, rootPath, multiuser }) {
    this._rootUrl = removeTrailingSlash(rootUrl)
    this._rootPath = removeTrailingSlash(rootPath)
    this._multiuser = multiuser
    this._readdir = readdir
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url, contentType, createIfNotExists }) {
    // Split the URL into components
    const { pathname } = typeof url === 'string' ? URL.parse(url) : url
    if (pathname.indexOf('/..') >= 0) {
      throw new Error('Disallowed /.. segment in URL')
    }

    let path
    // Create the path for a new file
    if (createIfNotExists) {
      path = `${this._rootPath}${pathname}`
      // If the extension is not correct for the content type, append the correct extension
      if (getContentType(pathname) !== contentType) {
        path += contentType in extensions ? `$.${extensions[contentType][0]}` : '$.unknown'
      }
    // Determine the path of an existing file
    } else {
      // Read all files in the corresponding folder
      const filename = /[^/]*$/.exec(pathname)[0]
      const folder = `${this._rootPath}${pathname.substr(0, pathname.length - filename.length)}`
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
  async mapFileToUrl ({ path }) {
    // Determine the URL by chopping off everything after the dollar sign
    const pathname = removeDollarExtension(path.substring(this._rootPath.length))
    const url = `${this._rootUrl}${pathname}`
    return { url, contentType: getContentType(path) }
  }
}

function removeTrailingSlash (path) {
  return path ? path.replace(/\/+$/, '') : ''
}

function removeDollarExtension (path) {
  return path.replace(/\$.*/, '')
}

function getContentType (path) {
  const extension = /\.([^/.]+)$/.exec(path)
  return extension && types[extension[1].toLowerCase()] || DEFAULT_CONTENTTYPE
}

module.exports = ResourceMapper
