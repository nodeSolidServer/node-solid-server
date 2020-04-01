const { join, dirname } = require('path')
const intoStream = require('into-stream')
const url = require('url')
const fs = require('fs')
const $rdf = require('rdflib')
const mkdirp = require('fs-extra').mkdirp
const uuid = require('uuid')
const debug = require('./debug')
const error = require('./http-error')
const stringToStream = require('./utils').stringToStream
const serialize = require('./utils').serialize
const overQuota = require('./utils').overQuota
const getContentType = require('./utils').getContentType
const extend = require('extend')
const rimraf = require('rimraf')
const ldpContainer = require('./ldp-container')
const parse = require('./utils').parse
const fetch = require('node-fetch')
const { promisify } = require('util')
const URL = require('url')
const withLock = require('./lock')
const utilPath = require('path')

const RDF_MIME_TYPES = new Set([
  'text/turtle',            // .ttl
  'text/n3',                // .n3
  'text/html',              // RDFa
  'application/xhtml+xml',  // RDFa
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'application/rdf+xml',    // .rdf
  'application/ld+json',    // .jsonld
  'application/x-turtle'
])

class LDP {
  constructor (argv = {}) {
    extend(this, argv)

    // Acl contentType
    if (!this.aclContentType) {
      this.aclContentType = 'text/turtle'
    }

    // Suffixes
    if (!this.suffixAcl) {
      this.suffixAcl = '.acl'
    }
    if (!this.suffixMeta) {
      this.suffixMeta = '.meta'
    }

    // Error pages folder
    this.errorPages = null
    if (!this.noErrorPages) {
      this.errorPages = argv.errorPages
      if (!this.errorPages) {
        // TODO: For now disable error pages if errorPages parameter is not explicitly passed
        this.noErrorPages = true
      } else if (!this.errorPages.endsWith('/')) {
        this.errorPages += '/'
      }
    }

    if (this.skin !== false) {
      this.skin = true
    }

    if (this.corsProxy && this.corsProxy[ 0 ] !== '/') {
      this.corsProxy = '/' + this.corsProxy
    }

    return this
  }

  async stat (file) {
    return new Promise((resolve, reject) => {
      fs.stat(file, (err, stats) => {
        if (err) return reject(error(err, "Can't read metadata of " + file))
        resolve(stats)
      })
    })
  }

  async readResource (url) {
    try {
      const { path } = await this.resourceMapper.mapUrlToFile({ url })
      return await withLock(path, () => promisify(fs.readFile)(path, {encoding: 'utf8'}))
    } catch (err) {
      throw error(err.status, err.message)
    }
  }

  async readContainerMeta (url) {
    if (url[ url.length - 1 ] !== '/') {
      url += '/'
    }
    return this.readResource(url + this.suffixMeta)
  }

  async listContainer (container, reqUri, containerData, hostname) {
    const resourceGraph = $rdf.graph()

    try {
      $rdf.parse(containerData, resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error parsing data: ' + err)
      throw error(500, "Can't parse container")
    }

    try {
      // add container stats
      await ldpContainer.addContainerStats(this, reqUri, container, resourceGraph)
      // read directory
      const files = await ldpContainer.readdir(container)
      // iterate through all the files
      await Promise.all(files.map(async file => {
        const { url: fileUri } = await this.resourceMapper.mapFileToUrl(
          { path: join(container, file), hostname })
        return await ldpContainer.addFile(this, resourceGraph, reqUri, fileUri, container, file)
      }))
    } catch (err) {
      throw error(500, "Can't list container")
    }

    // TODO 'text/turtle' is fixed, should be contentType instead
    // This forces one more translation turtle -> desired
    try {
      return await serialize(resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error serializing container: ' + err)
      throw error(500, "Can't serialize container")
    }
  }

  async post (hostname, containerPath, stream, { container, slug, extension, contentType }) {
    const ldp = this
    debug.handlers('POST -- On parent: ' + containerPath)
    // prepare slug
    if (slug) {
      slug = decodeURIComponent(slug)
      if (slug.match(/\/|\||:/)) {
        throw error(400, 'The name of new file POSTed may not contain : | or /')
      }
      // not to break pod ACL must have text/turtle contentType
      if (slug.endsWith(this.suffixAcl) || extension === this.suffixAcl) {
        if (contentType !== this.aclContentType) {
          throw error(415, 'POST contentType for ACL must be text/turtle')
        }
      }
    }
    // Containers should not receive an extension
    if (container) {
      extension = ''
    }
    // TODO: possibly package this in ldp.post
    let resourceUrl = await ldp.getAvailableUrl(hostname, containerPath, { slug, extension })
    debug.handlers('POST -- Will create at: ' + resourceUrl)
    let originalUrl = resourceUrl
    if (container) {
      // Create directory by an LDP PUT to the container's .meta resource
      resourceUrl = `${resourceUrl}${resourceUrl.endsWith('/') ? '' : '/'}${ldp.suffixMeta}`
      if (originalUrl && !originalUrl.endsWith('/')) {
        originalUrl += '/'
      }
    }
    // const { url: putUrl } = await this.resourceMapper.mapFileToUrl({ path: resourceUrl, hostname })

    await ldp.put(resourceUrl, stream, contentType)
    return URL.parse(originalUrl).path
  }

  /**
   * Serializes and writes a graph to the given uri, and returns the original
   * (non-serialized) graph.
   * Usage:
   *
   *   ```
   *   ldp.putGraph('https://localhost:8443/contacts/resource1.ttl', graph)
   *     .then(graph => {
   *       // success
   *     })
   *   ```
   *
   * @param graph {Graph}
   * @param uri {string}
   * @param [contentType] {string}
   *
   * @return {Promise<Graph>}
   */
  async putGraph (graph, uri, contentType) {
    const { path } = url.parse(uri)
    const content = await serialize(graph, uri, contentType)
    let stream = stringToStream(content)
    return await this.put(path, stream, contentType)
  }

  isValidRdf (body, requestUri, contentType) {
    const resourceGraph = $rdf.graph()
    try {
      $rdf.parse(body, resourceGraph, requestUri, contentType)
    } catch (err) {
      debug.ldp('VALIDATE -- Error parsing data: ' + err)
      return false
    }
    return true
  }

  async put (url, stream, contentType) {
    // PUT requests not supported on containers. Use POST instead
    if ((url.url || url).endsWith('/')) {
      throw error(409,
        'PUT not supported on containers, use POST instead')
    }

    // PUT without content type is forbidden
    if (!contentType) {
      throw error(415,
        'PUT request require a valid content type via the Content-Type header')
    }

    // not to break pod : url ACL must have text/turtle contentType
    if ((url.url || url).endsWith(this.suffixAcl) && contentType !== this.aclContentType) {
      throw error(415, 'PUT contentType for ACL must be text-turtle')
    }

    // First check if we are above quota
    let isOverQuota
    try {
      const { hostname } = URL.parse(url.url || url)
      isOverQuota = await overQuota(this.resourceMapper.resolveFilePath(hostname), this.serverUri)
    } catch (err) {
      throw error(500, 'Error finding user quota')
    }
    if (isOverQuota) {
      throw error(413, 'User has exceeded their storage quota')
    }

    // Second, create the enclosing directory, if necessary
    const { path } = await this.resourceMapper.mapUrlToFile({ url, contentType, createIfNotExists: true })
    const dirName = dirname(path)
    try {
      await promisify(mkdirp)(dirName)
    } catch (err) {
      debug.handlers('PUT -- Error creating directory: ' + err)
      throw error(err,
        'Failed to create the path to the new resource')
    }

    // Directory created, now write the file
    return withLock(path, { mustExist: false }, () => new Promise((resolve, reject) => {
      // HACK: the middleware in webid-oidc.js uses body-parser, thus ending the stream of data
      // for JSON bodies. So, the stream needs to be reset
      if (contentType.includes('application/json')) {
        stream = intoStream(JSON.stringify(stream.body))
      }
      const file = stream.pipe(fs.createWriteStream(path))
      file.on('error', function () {
        reject(error(500, 'Error writing data'))
      })
      file.on('finish', function () {
        debug.handlers('PUT -- Wrote data to: ' + path)
        resolve()
      })
    }))
  }

  async exists (hostname, path, searchIndex = true) {
    const options = { hostname, path, includeBody: false, searchIndex }
    return await this.get(options, searchIndex)
  }

  /**
   * Remotely loads the graph at a given uri, parses it and and returns it.
   * Usage:
   *
   *   ```
   *   ldp.fetchGraph('https://example.com/contacts/card1.ttl')
   *     .then(graph => {
   *       // const matches = graph.match(...)
   *     })
   *   ```
   *
   * @param uri {string} Fully qualified uri of the request.
   *
   * @param [options] {object} Options hashmap, passed through to fetchGraph
   *
   * @return {Promise<Graph>}
   */
  async fetchGraph (uri, options = {}) {
    const response = await fetch(uri)
    if (!response.ok) {
      const error = new Error(
        `Error fetching ${uri}: ${response.status} ${response.statusText}`
      )
      error.statusCode = response.status || 400
      throw error
    }
    const body = await response.text()

    return parse(body, uri, getContentType(response.headers))
  }

  /**
   * Loads from fs the graph at a given uri, parses it and and returns it.
   * Usage:
   *
   *   ```
   *   ldp.getGraph('https://localhost:8443/contacts/card1.ttl')
   *     .then(graph => {
   *       // let matches = graph.match(...)
   *     })
   *   ```
   *
   * @param uri {string} Fully qualified uri of the request.
   *   Note that the protocol part is needed, to provide a base URI to pass on
   *   to the graph parser.
   * @param [contentType] {string}
   *
   * @return {Promise<Graph>}
   */
  getGraph (uri, contentType) {
    return this.graph(uri, uri, contentType)
  }

  async graph (url, baseUri, contentType) {
    const body = await this.readResource(url)
    if (!contentType) {
      ({ contentType } = await this.resourceMapper.mapUrlToFile({ url }))
    }
    return new Promise((resolve, reject) => {
      const graph = $rdf.graph()
      $rdf.parse(body, graph, baseUri, contentType,
        err => err ? reject(err) : resolve(graph))
    })
  }

  async get (options, searchIndex = true) {
    let path, contentType, stats
    try {
      ({ path, contentType } = await this.resourceMapper.mapUrlToFile({ url: options, searchIndex }))
      stats = await this.stat(path)
    } catch (err) {
      throw error(404, 'Can\'t find file requested: ' + options)
    }

    // Just return, since resource exists
    if (!options.includeBody) {
      return { stream: stats, contentType, container: stats.isDirectory() }
    }

    // Found a container
    if (stats.isDirectory()) {
      const { url: absContainerUri } = await this.resourceMapper
        .mapFileToUrl({ path, hostname: options.hostname })
      const metaFile = await this.readContainerMeta(absContainerUri)
        .catch(() => '') // Default to an empty meta file if it is missing
      let data
      try {
        data = await this.listContainer(path, absContainerUri, metaFile, options.hostname)
      } catch (err) {
        debug.handlers('GET container -- Read error:' + err.message)
        throw err
      }
      const stream = stringToStream(data)
      // TODO 'text/turtle' is fixed, should be contentType instead
      // This forces one more translation turtle -> desired
      return { stream, contentType: 'text/turtle', container: true }
    } else {
      let chunksize, contentRange, start, end
      if (options.range) {
        const total = fs.statSync(path).size
        const parts = options.range.replace(/bytes=/, '').split('-')
        const partialstart = parts[0]
        const partialend = parts[1]
        start = parseInt(partialstart, 10)
        end = partialend ? parseInt(partialend, 10) : total - 1
        chunksize = (end - start) + 1
        contentRange = 'bytes ' + start + '-' + end + '/' + total
      }
      return withLock(path, () => new Promise((resolve, reject) => {
        const stream = fs.createReadStream(path, start && end ? {start, end} : {})
        stream
          .on('error', function (err) {
            debug.handlers(`GET -- error reading ${path}: ${err.message}`)
            return reject(error(err, "Can't read file " + err))
          })
          .on('open', function () {
            debug.handlers(`GET -- Reading ${path}`)
            return resolve({ stream, contentType, container: false, contentRange, chunksize })
          })
      }))
    }
  }

  async delete (url) {
    // First check if the path points to a valid file
    let path, stats
    try {
      ({ path } = await this.resourceMapper.mapUrlToFile({ url }))
      stats = await this.stat(path)
    } catch (err) {
      throw error(404, "Can't find " + err)
    }

    // If so, delete the directory or file
    if (stats.isDirectory()) {
      return this.deleteContainer(path)
    } else {
      return this.deleteResource(path)
    }
  }

  async deleteContainer (directory) {
    if (directory[ directory.length - 1 ] !== '/') {
      directory += '/'
    }

    // Ensure the container exists
    let list
    try {
      list = await promisify(fs.readdir)(directory)
    } catch (err) {
      throw error(404, 'The container does not exist')
    }

    // Ensure the container is empty (we ignore .meta and .acl)
    if (list.some(file => !file.endsWith(this.suffixMeta) && !file.endsWith(this.suffixAcl))) {
      throw error(409, 'Container is not empty')
    }

    // Delete the directory recursively
    try {
      await promisify(rimraf)(directory)
    } catch (err) {
      throw error(err, 'Failed to delete the container')
    }
  }

  async deleteResource (path) {
    try {
      return await withLock(path, { mustExist: false }, () => promisify(fs.unlink)(path))
    } catch (err) {
      debug.container('DELETE -- unlink() error: ' + err)
      throw error(err, 'Failed to delete resource')
    }
  }

  async getAvailableUrl (hostname, containerURI, { slug = uuid.v1(), extension }) {
    let requestUrl = this.resourceMapper.resolveUrl(hostname, containerURI)
    requestUrl = requestUrl.replace(/\/*$/, '/')

    const { path: containerFilePath } = await this.resourceMapper.mapUrlToFile({ url: requestUrl })
    let fileName = slug.endsWith(extension) || slug.endsWith(this.suffixAcl) || slug.endsWith(this.suffixMeta) ? slug : slug + extension
    if (await promisify(fs.exists)(utilPath.join(containerFilePath, fileName))) {
      fileName = `${uuid.v1()}-${fileName}`
    }

    return requestUrl + fileName
  }

  getTrustedOrigins (req) {
    let trustedOrigins = [this.resourceMapper.resolveUrl(req.hostname)].concat(this.trustedOrigins)
    if (this.multiuser) {
      trustedOrigins.push(this.serverUri)
    }
    return trustedOrigins
  }

  static mimeTypeIsRdf (mimeType) {
    return RDF_MIME_TYPES.has(mimeType)
  }

  static mimeTypesAsArray () {
    return Array.from(RDF_MIME_TYPES)
  }
}
module.exports = LDP
