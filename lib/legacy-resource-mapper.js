const ResourceMapper = require('./resource-mapper')

// A LegacyResourceMapper models the old mapping between HTTP URLs and server filenames,
// and is intended to be replaced by ResourceMapper
class LegacyResourceMapper extends ResourceMapper {
  constructor (options) {
    super(Object.assign({ defaultContentType: 'text/turtle' }, options))
  }

  // Maps the request for a given resource and representation format to a server file
  async mapUrlToFile ({ url }) {
    return { path: this._getFullPath(url), contentType: this._getContentTypeByExtension(url) }
  }

  // Preserve dollars in paths
  _removeDollarExtension (path) {
    return path
  }
}

module.exports = LegacyResourceMapper
