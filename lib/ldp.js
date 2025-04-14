/* eslint-disable node/no-deprecated-api */

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
const { clearAclCache } = require('./acl-checker')

const RDF_MIME_TYPES = new Set([
  'text/turtle', // .ttl
  'text/n3', // .n3
  'text/html', // RDFa
  'application/xhtml+xml', // RDFa
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'application/rdf+xml', // .rdf
  'application/ld+json', // .jsonld
  'application/x-turtle'
])

const suffixAcl = '.acl'
const suffixMeta = '.meta'
const AUXILIARY_RESOURCES = [suffixAcl, suffixMeta]

class LDP {
  constructor (argv = {}) {
    extend(this, argv)

    // Suffixes
    if (!this.suffixAcl) {
      this.suffixAcl = suffixAcl
    }
    if (!this.suffixMeta) {
      this.suffixMeta = suffixMeta
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

    if (this.corsProxy && this.corsProxy[0] !== '/') {
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
      return await withLock(path, () => promisify(fs.readFile)(path, { encoding: 'utf8' }))
    } catch (err) {
      throw error(err.status, err.message)
    }
  }

  async readContainerMeta (url) {
    if (url[url.length - 1] !== '/') {
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
      throw error(500, "Can't parse container .meta")
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
    // POST without content type is forbidden
    if (!contentType) {
      throw error(400,
        'POSTrequest requires a content-type via the Content-Type header')
    }

    const ldp = this
    debug.handlers('POST -- On parent: ' + containerPath)
    if (container) {
      // Containers should not receive an extension
      extension = ''
    }
    // pepare slug
    if (slug) {
      slug = decodeURIComponent(slug)

      if (container) {
        // the name of a container cannot be a valid auxiliary resource document
        while (this._containsInvalidSuffixes(slug + '/')) {
          const idx = slug.lastIndexOf('.')
          slug = slug.substr(0, idx)
        }
      } else if (this.isAuxResource(slug, extension)) throw error(403, 'POST to auxiliary resources is not allowed')

      if (slug.match(/\/|\||:/)) {
        throw error(400, 'The name of a POSTed new file may not contain ":" (colon), "|" (pipe), or "/" (slash)')
      }
    }

    // always return a valid URL.
    const resourceUrl = await ldp.getAvailableUrl(hostname, containerPath, { slug, extension, container })
    debug.handlers('POST -- Will create at: ' + resourceUrl)

    await ldp.put(resourceUrl, stream, contentType)
    return URL.parse(resourceUrl).path
  }

  isAuxResource (slug, extension) {
    let test = false
    for (const item in AUXILIARY_RESOURCES) {
      if (slug.endsWith(AUXILIARY_RESOURCES[item]) || extension === AUXILIARY_RESOURCES[item]) { test = true; break }
    }
    return test
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
    const stream = stringToStream(content)
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
    const container = (url.url || url).endsWith('/')
    // PUT without content type is forbidden, unless PUTting container
    if (!contentType && !container) {
      throw error(400,
        'PUT request requires a content-type via the Content-Type header')
    }
    // reject resource with percent-encoded $ extension
    const dollarExtensionRegex = /%(?:24)\.[^%(?:24)]*$/ // /\$\.[^$]*$/
    if ((url.url || url).match(dollarExtensionRegex)) {
      throw error(400, 'Resource with a $.ext is not allowed by the server')
    }
    // First check if we are above quota
    let isOverQuota
    // Someone had a reason to make url actually a req sometimes but not
    // all the time. So now we have to account for that, as done below.
    const hostname = typeof url !== 'string' ? url.hostname : URL.parse(url).hostname
    try {
      isOverQuota = await overQuota(this.resourceMapper.resolveFilePath(hostname), this.serverUri)
    } catch (err) {
      throw error(500, 'Error finding user quota')
    }
    if (isOverQuota) {
      throw error(413, 'User has exceeded their storage quota')
    }
    // Set url using folder/.meta
    let { path } = await this.resourceMapper.mapUrlToFile({
      url,
      contentType,
      createIfNotExists: true,
      searchIndex: false
    })

    if (container) { path += suffixMeta }
    // debug.handlers(container + ' item ' + (url.url || url) + ' ' + contentType + ' ' + path)
    // check if file exists, and in that case that it has the same extension
    if (!container) { await this.checkFileExtension(url, path) }
    // Create the enclosing directory, if necessary, do not create pubsub if PUT create container
    await this.createDirectory(path, hostname, !container)
    // clear cache
    if (path.endsWith(this.suffixAcl)) {
      const { url: aclUrl } = await this.resourceMapper.mapFileToUrl({ path, hostname })
      clearAclCache(aclUrl)
      // clearAclCache()
    }
    // Directory created, now write the file
    return withLock(path, () => new Promise((resolve, reject) => {
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

  /**
   * Create directory if not exists
   * Add pubsub if creating intermediate directory to a non-container
   *
   * @param {*} path
   * @param {*} hostname
   * @param {*} nonContainer
   */
  async createDirectory (path, hostname, nonContainer = true) {
    try {
      const dirName = dirname(path)
      if (!fs.existsSync(dirName)) {
        await promisify(mkdirp)(dirName)
        if (this.live && nonContainer) {
          // Get parent for the directory made
          const parentDirectoryPath = utilPath.dirname(dirName) + utilPath.sep

          // Get the url for the parent
          const parentDirectoryUrl = (await this.resourceMapper.mapFileToUrl({
            path: parentDirectoryPath,
            hostname
          })).url
          // Update websockets
          this.live(URL.parse(parentDirectoryUrl).pathname)
        }
      }
    } catch (err) {
      debug.handlers('PUT -- Error creating directory: ' + err)
      throw error(err,
        'Failed to create the path to the new resource')
    }
  }

  async checkFileExtension (url, path) {
    try {
      const { path: existingPath } = await this.resourceMapper.mapUrlToFile({ url })
      if (path !== existingPath) {
        try {
          await withLock(existingPath, () => promisify(fs.unlink)(existingPath))
        } catch (err) { throw error(err, 'Failed to delete resource') }
      }
    } catch (err) { }
  }

  /**
   * This function is used to make sure a resource or container which contains
   * reserved suffixes for auxiliary documents cannot be created.
   * @param {string} path - the uri to check for invalid suffixes
   * @returns {boolean} true is fail - if the path contains reserved suffixes
   */
  _containsInvalidSuffixes (path) {
    return AUXILIARY_RESOURCES.some(suffix => path.endsWith(suffix + '/'))
  }

  // check whether a document (or container) has the same name as another document (or container)
  async checkItemName (url) {
    let testName, testPath
    const { hostname, pathname } = this.resourceMapper._parseUrl(url) // (url.url || url)
    let itemUrl = this.resourceMapper.resolveUrl(hostname, pathname)
    // make sure the resource being created does not attempt invalid resource creation
    if (this._containsInvalidSuffixes(itemUrl)) {
      throw error(400, `${itemUrl} contained reserved suffixes in path`)
    }
    const container = itemUrl.endsWith('/')
    try {
      const testUrl = container ? itemUrl.slice(0, -1) : itemUrl + '/'
      const { path: testPath } = await this.resourceMapper.mapUrlToFile({ url: testUrl })
      testName = container ? fs.lstatSync(testPath).isFile() : fs.lstatSync(testPath).isDirectory()
    } catch (err) {
      testName = false

      // item does not exist, check one level up the tree
      if (itemUrl.endsWith('/')) itemUrl = itemUrl.substring(0, itemUrl.length - 1)
      itemUrl = itemUrl.substring(0, itemUrl.lastIndexOf('/') + 1)
      const { pathname } = this.resourceMapper._parseUrl(itemUrl) // (url.url || url)
      // check not at root
      if (pathname !== '/') {
        return await this.checkItemName(itemUrl)
      }
    }
    if (testName) {
      throw error(409, `${testPath}: Container and resource cannot have the same name in URI`)
    }
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

  // this is a hack to replace solid:owner, using solid:account in /.meta to avoid NSS migration
  // this /.meta has no functionality in actual NSS
  // comment https://github.com/solid/node-solid-server/pull/1604#discussion_r652903546
  async isOwner (webId, hostname) {
    // const ldp = req.app.locals.ldp
    const rootUrl = this.resourceMapper.resolveUrl(hostname)
    let graph
    try {
      // TODO check for permission ?? Owner is a MUST
      graph = await this.getGraph(rootUrl + '/.meta')
      const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')
      const owner = await graph.statementsMatching($rdf.sym(webId), SOLID('account'), $rdf.sym(rootUrl + '/'))
      return owner.length
    } catch (error) {
      throw new Error(`Failed to get owner from ${rootUrl}/.meta, got ` + error)
    }
  }

  async get (options, searchIndex = true) {
    let path, contentType, stats
    try {
      ({ path, contentType } = await this.resourceMapper.mapUrlToFile({ url: options, searchIndex }))
      stats = await this.stat(path)
    } catch (err) {
      throw error(err.status || 500, err.message)
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
      // TODO contentType is defaultContainerContentType ('text/turtle'),
      // This forces one translation turtle -> desired
      return { stream, contentType, container: true }
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
        const stream = fs.createReadStream(path, start && end ? { start, end } : {})
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

    // delete aclCache
    let aclUrl = typeof url !== 'string' ? this.resourceMapper.getRequestUrl(url) : url
    aclUrl = aclUrl.endsWith(this.suffixAcl) ? aclUrl : aclUrl + this.suffixAcl
    debug.handlers('DELETE ACL CACHE ' + aclUrl)
    clearAclCache(aclUrl)

    // If so, delete the directory or file
    if (stats.isDirectory()) {
      // DELETE method not allowed on podRoot
      if ((url.url || url) === '/') {
        throw error(405, 'DELETE of PodRoot is not allowed')
      }
      return this.deleteContainer(path)
    } else {
      // DELETE method not allowed on podRoot/.acl
      if (['/' + this.suffixAcl, '/profile/card'].some(item => (url.url || url) === item)) {
        throw error(405, `DELETE of ${url.url || url} is not allowed`)
      }
      return this.deleteDocument(path)
    }
  }

  async deleteContainer (directory) {
    if (directory[directory.length - 1] !== '/') {
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

  // delete document (resource with acl and meta links)
  async deleteDocument (filePath) {
    const linkPath = this.resourceMapper._removeDollarExtension(filePath)
    try {
      // first delete file, then links with write permission only (atomic delete)
      await withLock(filePath, () => promisify(fs.unlink)(filePath))

      const aclPath = `${linkPath}${this.suffixAcl}`
      if (await promisify(fs.exists)(aclPath)) {
        await withLock(aclPath, () => promisify(fs.unlink)(aclPath))
      }
      const metaPath = `${linkPath}${this.suffixMeta}`
      if (await promisify(fs.exists)(metaPath)) {
        await withLock(metaPath, () => promisify(fs.unlink)(metaPath))
      }
    } catch (err) {
      debug.container('DELETE -- unlink() error: ' + err)
      throw error(err, 'Failed to delete resource')
    }
  }

  async getAvailableUrl (hostname, containerURI, { slug = uuid.v1(), extension, container }) {
    let requestUrl = this.resourceMapper.resolveUrl(hostname, containerURI)
    requestUrl = requestUrl.replace(/\/*$/, '/') // ??? what for

    let itemName = slug.endsWith(extension) || slug.endsWith(this.suffixAcl) || slug.endsWith(this.suffixMeta) ? slug : slug + extension
    try {
      // check whether resource exists
      const context = container ? '/' : ''
      await this.resourceMapper.mapUrlToFile({ url: (requestUrl + itemName + context) })
      itemName = `${uuid.v1()}-${itemName}`
    } catch (e) {
      try {
        // check whether resource with same name exists
        const context = !container ? '/' : ''
        await this.resourceMapper.mapUrlToFile({ url: (requestUrl + itemName + context) })
        itemName = `${uuid.v1()}-${itemName}`
      } catch (e) {}
    }
    if (container) itemName += '/'
    return requestUrl + itemName
  }

  getTrustedOrigins (req) {
    const trustedOrigins = [this.resourceMapper.resolveUrl(req.hostname)].concat(this.trustedOrigins)
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
