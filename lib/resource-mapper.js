const URL = require('url')
const { types, extensions } = require('mime-types')

const DEFAULT_CONTENTTYPE = 'application/octet-stream'

// A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
// following the principles of the “sweet spot” discussed in
// https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
class ResourceMapper {
  constructor ({ rootUrl, rootPath, multiuser }) {
    this._rootUrl = removeTrailingSlash(rootUrl)
    this._rootPath = removeTrailingSlash(rootPath)
    this._multiuser = multiuser
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url, contentType }) {
    // Split the URL into components
    const { pathname } = typeof url === 'string' ? URL.parse(url) : url
    const urlExtension = getExtension(pathname)
    const urlPath = pathname.substr(0, pathname.length - urlExtension.length)

    // Sanity checks
    if (urlPath.indexOf('/..') >= 0) {
      throw new Error('Disallowed /.. segment in URL')
    }

    // Map to the filename on disk, appending the extension of different from the URL
    const extension = contentType in extensions ? `.${extensions[contentType][0]}` : '.unknown'
    const suffix = extension === urlExtension ? extension : `${urlExtension}$${extension}`
    const path = `${this._rootPath}${urlPath}${suffix}`

    return { path, contentType: contentType || DEFAULT_CONTENTTYPE }
  }

  // Maps a given server file to a URL
  async mapFileToUrl ({ path }) {
    // Determine the URL by shopping off everything after the dollar sign
    const pathname = path.substring(this._rootPath.length).replace(/\$.*/, '')
    const url = `${this._rootUrl}${pathname}`

    // Determine the content type
    const extension = getExtension(path)
    const contentType = types[extension.substr(1)] || DEFAULT_CONTENTTYPE

    return { url, contentType }
  }
}

function removeTrailingSlash (path) {
  return path ? path.replace(/\/+$/, '') : ''
}

function getExtension (path) {
  return /(\.[^/.]+)?$/.exec(path)[0]
}

module.exports = ResourceMapper
