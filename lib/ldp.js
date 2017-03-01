var mime = require('mime-types')
var path = require('path')
const url = require('url')
var fs = require('fs')
var $rdf = require('rdflib')
var async = require('async')
// var url = require('url')
var mkdirp = require('fs-extra').mkdirp
var uuid = require('uuid')
var debug = require('./debug')
var utils = require('./utils')
var error = require('./http-error')
var stringToStream = require('./utils').stringToStream
var serialize = require('./utils').serialize
var extend = require('extend')
var doWhilst = require('async').doWhilst
var rimraf = require('rimraf')
var ldpContainer = require('./ldp-container')
var parse = require('./utils').parse

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

    if (this.fileBrowser !== false) {
      this.fileBrowser = argv.fileBrowser ||
        'https://linkeddata.github.io/warp/#/list/'
    }

    if (this.skin !== false) {
      this.skin = true
    }

    if (this.webid && !this.auth) {
      this.auth = 'tls'
    }

    if (this.proxy && this.proxy[ 0 ] !== '/') {
      this.proxy = '/' + this.proxy
    }

    debug.settings('Suffix Acl: ' + this.suffixAcl)
    debug.settings('Suffix Meta: ' + this.suffixMeta)
    debug.settings('Filesystem Root: ' + this.root)
    debug.settings('Allow WebID authentication: ' + !!this.webid)
    debug.settings('Live-updates: ' + !!this.live)
    debug.settings('Identity Provider: ' + !!this.idp)
    debug.settings('Default file browser app: ' + this.fileBrowser)
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
    var ldp = this

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
    var ldp = this
    // var host = url.parse(uri).hostname
    // var root = !ldp.idp ? ldp.root : ldp.root + host + '/'

    // var baseUri = utils.filenameToBaseUri(filename, uri, root)
    var resourceGraph = $rdf.graph()

    try {
      $rdf.parse(containerData, resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error parsing data: ' + err)
      return callback(error(500, "Can't parse container"))
    }

    async.waterfall(
      [
        // add container stats
        function (next) {
          ldpContainer.addContainerStats(ldp, reqUri, filename, resourceGraph, next)
        },
        // reading directory
        function (next) {
          ldpContainer.readdir(filename, next)
        },
        // Iterate through all the files
        function (files, next) {
          async.each(
            files,
            function (file, cb) {
              let fileUri = reqUri + encodeURIComponent(file)
              ldpContainer.addFile(ldp, resourceGraph, reqUri, fileUri, uri,
                filename, file, cb)
            },
            next)
        }
      ],
      function (err, data) {
        if (err) {
          return callback(error(500, "Can't list container"))
        }
        // TODO 'text/turtle' is fixed, should be contentType instead
        // This forces one more translation turtle -> desired
        serialize(resourceGraph, reqUri, 'text/turtle', function (err, result) {
          if (err) {
            debug.handlers('GET -- Error serializing container: ' + err)
            return callback(error(500, "Can't serialize container"))
          }
          return callback(null, result)
        })
      })
  }

  post (hostname, containerPath, slug, stream, container, callback) {
    var ldp = this
    debug.handlers('POST -- On parent: ' + containerPath)
    // prepare slug
    if (slug) {
      slug = decodeURIComponent(slug)
      if (slug.match(/\/|\||:/)) {
        callback(error(400, 'The name of new file POSTed may not contain : | or /'))
        return
      }
    }
    // TODO: possibly package this in ldp.post
    ldp.getAvailablePath(hostname, containerPath, slug, function (resourcePath) {
      debug.handlers('POST -- Will create at: ' + resourcePath)
      let originalPath = resourcePath
      if (container) {
        // Create directory by an LDP PUT to the container's .meta resource
        resourcePath = path.join(originalPath, ldp.suffixMeta)
        if (originalPath && !originalPath.endsWith('/')) {
          originalPath += '/'
        }
      }
      ldp.put(hostname, resourcePath, stream, function (err) {
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
    var ldp = this
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
    var filePath = utils.uriToFilename(resourcePath, root, host)

    // PUT requests not supported on containers. Use POST instead
    if (filePath.endsWith('/')) {
      return callback(error(409,
        'PUT not supported on containers, use POST instead'))
    }
    // First, create the enclosing directory, if necessary
    var dirName = path.dirname(filePath)
    mkdirp(dirName, (err) => {
      if (err) {
        debug.handlers('PUT -- Error creating directory: ' + err)
        return callback(error(err,
          'Failed to create the path to the new resource'))
      }
      // Directory created, now write the file
      var file = stream.pipe(fs.createWriteStream(filePath))
      file.on('error', function () {
        callback(error(500, 'Error writing data'))
      })
      file.on('finish', function () {
        debug.handlers('PUT -- Wrote data to: ' + filePath)
        callback(null)
      })
    })
  }

  exists (host, reqPath, callback) {
    var options = {
      'hostname': host,
      'path': reqPath,
      'baseUri': undefined,
      'includeBody': false,
      'possibleRDFType': undefined
    }
    this.get(options, callback)
  }

  /**
   * Fetches the graph at a given uri, parses it and and returns it.
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
    let parsedUri = url.parse(uri)
    let path = parsedUri.pathname
    let hostname = parsedUri.hostname

    return new Promise((resolve, reject) => {
      this.graph(hostname, path, uri, contentType, (error, graph) => {
        if (error) { return reject(error) }

        resolve(graph)
      })
    })
  }

  graph (host, reqPath, baseUri, contentType, callback) {
    var ldp = this

    // overloading
    if (typeof contentType === 'function') {
      callback = contentType
      contentType = 'text/turtle'
    }

    if (typeof baseUri === 'function') {
      callback = baseUri
      baseUri = undefined
    }

    var root = ldp.idp ? ldp.root + host + '/' : ldp.root
    var filename = utils.uriToFilename(reqPath, root)

    async.waterfall([
      // Read file
      function (cb) {
        return ldp.readFile(filename, cb)
      },
      // Parse file
      function (body, cb) {
        parse(body, baseUri, contentType, function (err, graph) {
          cb(err, graph)
        })
      }
    ], callback)
  }

  get (options, callback) {
    if (options) {
      var host = options.hostname
      var reqPath = options.path
      var baseUri = options.baseUri
      var includeBody = options.includeBody
      var contentType = options.possibleRDFType
      var range = options.range
    }
    var ldp = this
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
    var filename = utils.uriToFilename(reqPath, root)

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
          let absContainerUri = baseUri + reqPath
          ldp.listContainer(filename, absContainerUri, baseUri, metaFile, contentType,
            function (err, data) {
              if (err) {
                debug.handlers('GET container -- Read error:' + err.message)
                return callback(err)
              }
              var stream = stringToStream(data)
              // TODO 'text/turtle' is fixed, should be contentType instead
              // This forces one more translation turtle -> desired
              return callback(null, {'stream': stream, 'contentType': 'text/turtle', 'container': true})
            })
        })
      } else {
        var stream
        if (range) {
          var total = fs.statSync(filename).size
          var parts = range.replace(/bytes=/, '').split('-')
          var partialstart = parts[0]
          var partialend = parts[1]
          var start = parseInt(partialstart, 10)
          var end = partialend ? parseInt(partialend, 10) : total - 1
          var chunksize = (end - start) + 1
          var contentRange = 'bytes ' + start + '-' + end + '/' + total
          stream = ldp.createReadStream(filename, start, end)
        } else {
          stream = ldp.createReadStream(filename)
        }
        stream
          .on('error', function (err) {
            debug.handlers('GET -- Read error:' + err.message)
            return callback(error(err, "Can't create file " + err))
          })
          .on('open', function () {
            debug.handlers('GET -- Read Start.')
            var contentType = mime.lookup(filename) || DEFAULT_CONTENT_TYPE
            if (utils.hasSuffix(filename, ldp.turtleExtensions)) {
              contentType = 'text/turtle'
            }
            return callback(null, {'stream': stream, 'contentType': contentType, 'container': false, 'contentRange': contentRange, 'chunksize': chunksize})
          })
      }
    })
  }

  delete (host, resourcePath, callback) {
    var ldp = this
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
    var filename = utils.uriToFilename(resourcePath, root)
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
    var self = this
    if (directory[ directory.length - 1 ] !== '/') {
      directory += '/'
    }

    var countValid = 0
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

  getAvailablePath (host, containerURI, slug, callback) {
    var self = this
    var exists

    if (!slug) {
      slug = uuid.v1()
    }

    var newPath = path.join(containerURI, slug)

    // TODO: maybe a nicer code
    doWhilst(
      function (next) {
        self.exists(host, newPath, function (err) {
          exists = !err

          if (exists) {
            var id = uuid.v1().split('-')[ 0 ] + '-'
            newPath = path.join(containerURI, id + slug)
          }

          next()
        })
      },
      function () {
        return exists === true
      },
      function () {
        callback(newPath)
      })
  }
}
module.exports = LDP
module.exports.RDF_MIME_TYPES = RDF_MIME_TYPES
