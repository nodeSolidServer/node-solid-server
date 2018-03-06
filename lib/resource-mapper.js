const URL = require('url')
const { extensions } = require('mime-types')

// A ResourceMapper maintains the mapping between HTTP URLs and server filenames,
// following the principles of the “sweet spot” discussed in
// https://www.w3.org/DesignIssues/HTTPFilenameMapping.html
class ResourceMapper {
  constructor ({ rootPath, multiuser }) {
    this._rootPath = rootPath.replace(/\/+$/, '')
    this._multiuser = multiuser
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url, contentTypes }) {
    // Split the URL into components
    const { pathname } = typeof url === 'string' ? URL.parse(url) : url
    const urlExtension = /(\.[^/.]+)?$/.exec(pathname)[0]
    const urlPath = pathname.substr(0, pathname.length - urlExtension.length)

    // Map to the filename on disk, appending the extension of different from the URL
    const contentType = contentTypes && contentTypes[0] || ''
    const extension = contentType in extensions ? `.${extensions[contentType][0]}` : ''
    const suffix = extension === urlExtension ? extension : `${urlExtension}$${extension}`
    const path = `${this._rootPath}${urlPath}${suffix}`

    return { path }
  }
}

module.exports = ResourceMapper
