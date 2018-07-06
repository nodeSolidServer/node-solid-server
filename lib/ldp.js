const mime = require('mime-types')
const path = require('path')
const url = require('url')
const fs = require('fs')
const $rdf = require('rdflib')
const mkdirp = require('fs-extra').mkdirp
const uuid = require('uuid')
const debug = require('./debug')
const utils = require('./utils')
const error = require('./http-error')
const stringToStream = require('./utils').stringToStream
const serialize = require('./utils').serialize
const extend = require('extend')
const rimraf = require('rimraf')
const ldpContainer = require('./ldp-container')
const parse = require('./utils').parse
const fetch = require('node-fetch')
const { promisify } = require('util')

const DEFAULT_CONTENT_TYPE = 'text/turtle'

const RDF_MIME_TYPES = [
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
]

class LDP {
  constructor (argv = {}) {
    extend(this, argv)

    // Setting root
    if (!this.root) {
      this.root = process.cwd()
    }
    if (!this.root.endsWith('/')) {
      this.root += '/'
    }

    // Suffixes
    if (!this.suffixAcl) {
      this.suffixAcl = '.acl'
    }
    if (!this.suffixMeta) {
      this.suffixMeta = '.meta'
    }
    this.turtleExtensions = [ '.ttl', this.suffixAcl, this.suffixMeta ]

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

    debug.settings('Server URI: ' + this.serverUri)
    debug.settings('Auth method: ' + this.auth)
    debug.settings('Db path: ' + this.dbPath)
    debug.settings('Config path: ' + this.configPath)
    debug.settings('Suffix Acl: ' + this.suffixAcl)
    debug.settings('Suffix Meta: ' + this.suffixMeta)
    debug.settings('Filesystem Root: ' + this.root)
    debug.settings('Allow WebID authentication: ' + !!this.webid)
    debug.settings('Live-updates: ' + !!this.live)
    debug.settings('Multi-user: ' + !!this.multiuser)
    debug.settings('Suppress default data browser app: ' + this.suppressDataBrowser)
    debug.settings('Default data browser app file path: ' + this.dataBrowserPath)

    return this
  }

  stat (file, callback) {
    fs.stat(file, function (err, stats) {
      if (err) {
        return callback(error(err, "Can't read metadata"))
      }
      return callback(null, stats)
    })
  }

  createReadStream (filename, start, end) {
    if (start && end) {
      return fs.createReadStream(filename, {'start': start, 'end': end})
    } else {
      return fs.createReadStream(filename)
    }
  }

  readFile (filename, callback) {
    fs.readFile(
      filename,
      { 'encoding': 'utf8' },
      function (err, data) {
        if (err) {
          return callback(error(err, "Can't read file"))
        }
        return callback(null, data)
      })
  }

  readContainerMeta (directory, callback) {
    const ldp = this

    if (directory[ directory.length - 1 ] !== '/') {
      directory += '/'
    }

    ldp.readFile(directory + ldp.suffixMeta, function (err, data) {
      if (err) {
        return callback(error(err, "Can't read meta file"))
      }

      return callback(null, data)
    })
  }

  listContainer (filename, reqUri, uri, containerData, contentType, callback) {
    const ldp = this
    // var host = url.parse(uri).hostname
    // var root = !ldp.multiuser ? ldp.root : ldp.root + host + '/'

    // var baseUri = utils.filenameToBaseUri(filename, uri, root)
    const resourceGraph = $rdf.graph()

    try {
      $rdf.parse(containerData, resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error parsing data: ' + err)
      return callback(error(500, "Can't parse container"))
    }

    // add container stats
    new Promise((resolve, reject) =>
      ldpContainer.addContainerStats(ldp, reqUri, filename, resourceGraph,
        err => err ? reject(err) : resolve())
    )
    // read directory
    .then(() => new Promise((resolve, reject) =>
      ldpContainer.readdir(filename,
        (err, files) => err ? reject(err) : resolve(files))
    ))
    // iterate through all the files
    .then(files => {
      return Promise.all(files.map(file =>
        new Promise((resolve, reject) => {
          const fileUri = url.resolve(reqUri, encodeURIComponent(file))
          ldpContainer.addFile(ldp, resourceGraph, reqUri, fileUri, uri,
            filename, file, err => err ? reject(err) : resolve())
        })
      ))
    })
    .catch(() => { throw error(500, "Can't list container") })
    .then(() => new Promise((resolve, reject) => {
      // TODO 'text/turtle' is fixed, should be contentType instead
      // This forces one more translation turtle -> desired
      serialize(resourceGraph, reqUri, 'text/turtle', function (err, result) {
        if (err) {
          debug.handlers('GET -- Error serializing container: ' + err)
          reject(error(500, "Can't serialize container"))
        } else {
          resolve(result)
        }
      })
    }))
    .then(result => callback(null, result), callback)
  }

  post (host, containerPath, stream, { container, slug, extension }, callback) {
    const ldp = this
    debug.handlers('POST -- On parent: ' + containerPath)
    // prepare slug
    if (slug) {
      slug = decodeURIComponent(slug)
      if (slug.match(/\/|\||:/)) {
        callback(error(400, 'The name of new file POSTed may not contain : | or /'))
        return
      }
    }
    // Containers should not receive an extension
    if (container) {
      extension = ''
    }
    // TODO: possibly package this in ldp.post
    ldp.getAvailablePath(host, containerPath, { slug, extension }).then(resourcePath => {
      debug.handlers('POST -- Will create at: ' + resourcePath)
      let originalPath = resourcePath
      if (container) {
        // Create directory by an LDP PUT to the container's .meta resource
        resourcePath = path.join(originalPath, ldp.suffixMeta)
        if (originalPath && !originalPath.endsWith('/')) {
          originalPath += '/'
        }
      }
      ldp.put(host, resourcePath, stream, function (err) {
        if (err) callback(err)
        callback(null, originalPath)
      })
    })
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
  putGraph (graph, uri, contentType = DEFAULT_CONTENT_TYPE) {
    return new Promise((resolve, reject) => {
      let parsedUri = url.parse(uri)
      let hostname = parsedUri.hostname
      let path = parsedUri.pathname

      serialize(graph, uri, contentType, (error, content) => {
        if (error) { return reject(error) }

        let stream = stringToStream(content)

        this.put(hostname, path, stream, (error) => {
          if (error) { return reject(error) }

          resolve(graph)
        })
      })
    })
  }

  put (host, resourcePath, stream, callback) {
    const ldp = this
    const root = !ldp.multiuser ? ldp.root : ldp.root + host + '/'
    const filePath = utils.uriToFilename(resourcePath, root, host)

    // PUT requests not supported on containers. Use POST instead
    if (filePath.endsWith('/')) {
      return callback(error(409,
        'PUT not supported on containers, use POST instead'))
    }
    // First, create the enclosing directory, if necessary
    const dirName = path.dirname(filePath)
    mkdirp(dirName, (err) => {
      if (err) {
        debug.handlers('PUT -- Error creating directory: ' + err)
        return callback(error(err,
          'Failed to create the path to the new resource'))
      }
      // Directory created, now write the file
      const file = stream.pipe(fs.createWriteStream(filePath))
      file.on('error', function () {
        callback(error(500, 'Error writing data'))
      })
      file.on('finish', function () {
        debug.handlers('PUT -- Wrote data to: ' + filePath)
        callback(null)
      })
    })
  }

  exists (hostname, path, callback) {
    const options = { hostname, path, includeBody: false }
    if (callback) {
      return this.get(options, callback)
    } else {
      return new Promise((resolve, reject) => {
        this.get(options, err => err ? reject(err) : resolve(true))
      })
    }
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
  async fetchGraph (uri, options) {
    const response = await fetch(uri)
    if (!response.ok) {
      const error = new Error(
        `Error fetching ${uri}: ${response.status} ${response.statusText}`
      )
      error.statusCode = response.status || 400
      throw error
    }
    const body = await response.text()

    const contentType = options.contentType || DEFAULT_CONTENT_TYPE

    return promisify(parse)(body, uri, contentType)
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
  getGraph (uri, contentType = DEFAULT_CONTENT_TYPE) {
    const parsedUri = url.parse(uri)
    const path = parsedUri.pathname
    const hostname = parsedUri.hostname

    return new Promise((resolve, reject) => {
      this.graph(hostname, path, uri, contentType, (error, graph) => {
        if (error) { return reject(error) }

        resolve(graph)
      })
    })
  }

  graph (host, reqPath, baseUri, contentType, callback) {
    const ldp = this

    // overloading
    if (typeof contentType === 'function') {
      callback = contentType
      contentType = 'text/turtle'
    }

    if (typeof baseUri === 'function') {
      callback = baseUri
      baseUri = undefined
    }

    const root = ldp.multiuser ? ldp.root + host + '/' : ldp.root
    const filename = utils.uriToFilename(reqPath, root)

    ldp.readFile(filename, (err, body) => {
      if (err) return callback(err)
      parse(body, baseUri, contentType, callback)
    })
  }

  get (options, callback) {
    let host
    let reqPath
    let baseUri
    let includeBody
    let contentType
    let range
    if (options) {
      host = options.hostname
      reqPath = options.path
      baseUri = options.baseUri
      includeBody = options.includeBody
      contentType = options.possibleRDFType
      range = options.range
    }
    const ldp = this
    const root = !ldp.multiuser ? ldp.root : ldp.root + host + '/'
    const filename = utils.uriToFilename(reqPath, root)

    ldp.stat(filename, function (err, stats) {
      // File does not exist
      if (err) {
        return callback(error(err, 'Can\'t find file requested: ' + filename))
      }

      // Just return, since resource exists
      if (!includeBody) {
        return callback(null, {'stream': stats, 'contentType': contentType, 'container': stats.isDirectory()})
      }

      // Found a container
      if (stats.isDirectory()) {
        return ldp.readContainerMeta(filename, function (err, metaFile) {
          if (err) {
            metaFile = ''
          }
          const absContainerUri = baseUri + reqPath
          ldp.listContainer(filename, absContainerUri, baseUri, metaFile, contentType,
            function (err, data) {
              if (err) {
                debug.handlers('GET container -- Read error:' + err.message)
                return callback(err)
              }
              const stream = stringToStream(data)
              // TODO 'text/turtle' is fixed, should be contentType instead
              // This forces one more translation turtle -> desired
              return callback(null, {'stream': stream, 'contentType': 'text/turtle', 'container': true})
            })
        })
      } else {
        let stream
        let chunksize
        let contentRange
        if (range) {
          const total = fs.statSync(filename).size
          const parts = range.replace(/bytes=/, '').split('-')
          const partialstart = parts[0]
          const partialend = parts[1]
          const start = parseInt(partialstart, 10)
          const end = partialend ? parseInt(partialend, 10) : total - 1
          chunksize = (end - start) + 1
          contentRange = 'bytes ' + start + '-' + end + '/' + total
          stream = ldp.createReadStream(filename, start, end)
        } else {
          stream = ldp.createReadStream(filename)
        }
        stream
          .on('error', function (err) {
            debug.handlers(`GET -- error reading ${filename}: ${err.message}`)
            return callback(error(err, "Can't read file " + err))
          })
          .on('open', function () {
            debug.handlers(`GET -- Reading ${filename}`)
            let contentType = mime.lookup(filename) || DEFAULT_CONTENT_TYPE
            if (utils.hasSuffix(filename, ldp.turtleExtensions)) {
              contentType = 'text/turtle'
            }
            return callback(null, {'stream': stream, 'contentType': contentType, 'container': false, 'contentRange': contentRange, 'chunksize': chunksize})
          })
      }
    })
  }

  delete (host, resourcePath, callback) {
    const ldp = this
    const root = !ldp.multiuser ? ldp.root : ldp.root + host + '/'
    const filename = utils.uriToFilename(resourcePath, root)
    ldp.stat(filename, function (err, stats) {
      if (err) {
        return callback(error(404, "Can't find " + err))
      }

      if (stats.isDirectory()) {
        return ldp.deleteContainer(filename, callback)
      } else {
        return ldp.deleteResource(filename, callback)
      }
    })
  }

  deleteContainer (directory, callback) {
    const self = this
    if (directory[ directory.length - 1 ] !== '/') {
      directory += '/'
    }

    let countValid = 0
    fs.readdir(directory, function (err, list) {
      if (err) return callback(error(404, 'The container does not exist'))

      if (list.indexOf(self.suffixMeta) > -1) {
        countValid++
      }

      if (list.indexOf(self.suffixAcl) > -1) {
        countValid++
      }

      if (list.length !== countValid) {
        return callback(error(409, 'Container is not empty'))
      }

      return rimraf(directory, function (err) {
        if (err) return callback(error(err, 'Failed to delete the container'))
        return callback(null)
      })
    })
  }

  deleteResource (filename, callback) {
    return fs.unlink(filename, function (err, data) {
      if (err) {
        debug.container('DELETE -- unlink() error: ' + err)
        return callback(error(err, 'Failed to delete resource'))
      }
      return callback(null, data)
    })
  }

  getAvailablePath (host, containerURI, { slug = uuid.v1(), extension }) {
    const filename = slug + extension
    function ensureNotExists (self, newPath) {
      // Verify whether the new path already exists
      return self.exists(host, newPath).then(
        // If it does, generate another one
        () => ensureNotExists(self, path.join(containerURI,
                `${uuid.v1().split('-')[0]}-${filename}`)),
        // If not, we found an appropriate path
        () => newPath
      )
    }
    return ensureNotExists(this, path.join(containerURI, filename))
  }
}
module.exports = LDP
module.exports.RDF_MIME_TYPES = RDF_MIME_TYPES
