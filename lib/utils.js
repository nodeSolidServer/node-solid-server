module.exports.uriToFilename = uriToFilename
module.exports.uriToRelativeFilename = uriToRelativeFilename
module.exports.getBaseUri = getBaseUri
module.exports.pathBasename = pathBasename
module.exports.getFullUri = getFullUri
module.exports.hasSuffix = hasSuffix
module.exports.parse = parse
module.exports.processHandlebarFile = processHandlebarFile
module.exports.serialize = serialize
module.exports.translate = translate
module.exports.stringToStream = stringToStream
module.exports.reqToPath = reqToPath
module.exports.debrack = debrack
module.exports.stripLineEndings = stripLineEndings
module.exports.fullUrlForReq = fullUrlForReq
module.exports.routeResolvedFile = routeResolvedFile

const fs = require('fs-extra')
const path = require('path')
const $rdf = require('rdflib')
const from = require('from2')
const url = require('url')
const Handlebars = require('handlebars')
const debug = require('./debug').errors

/**
 * Returns a fully qualified URL from an Express.js Request object.
 * (It's insane that Express does not provide this natively.)
 *
 * Usage:
 *
 *   ```
 *   console.log(util.fullUrlForReq(req))
 *   // -> https://example.com/path/to/resource?q1=v1
 *   ```
 *
 * @param req {IncomingRequest}
 *
 * @return {string}
 */
function fullUrlForReq (req) {
  let fullUrl = url.format({
    protocol: req.protocol,
    host: req.get('host'),
    pathname: url.resolve(req.baseUrl, req.path),
    query: req.query
  })

  return fullUrl
}

/**
 * Removes the `<` and `>` brackets around a string and returns it.
 * Used by the `allow` handler in `verifyDelegator()` logic.
 * @method debrack
 *
 * @param s {string}
 *
 * @return {string}
 */
function debrack (s) {
  if (!s || s.length < 2) {
    return s
  }
  if (s[0] !== '<') {
    return s
  }
  if (s[s.length - 1] !== '>') {
    return s
  }
  return s.substring(1, s.length - 1)
}

function uriToFilename (uri, base) {
  const decoded = uri.split('/').map(decodeURIComponent).join('/')
  let filename = path.join(base, decoded)
  // Make sure filename ends with '/'  if filename exists and is a directory.
  // TODO this sync operation can be avoided and can be left
  // to do, to other components, see `ldp.get`
  try {
    const fileStats = fs.statSync(filename)
    if (fileStats.isDirectory() && !filename.endsWith('/')) {
      filename += '/'
    } else if (fileStats.isFile() && filename.endsWith('/')) {
      filename = filename.substr(0, filename.length - 1)
    }
  } catch (err) {}
  return filename
}

function uriToRelativeFilename (uri, base) {
  const filename = uriToFilename(uri, base)
  const relative = path.relative(base, filename)
  return relative
}

function getBaseUri (req) {
  // Obtain the protocol from the configured server URI
  // (in case the server is running behind a reverse proxy)
  const locals = req.app.locals
  const serverUri = locals.host.serverUri
  const protocol = serverUri.replace(/:.*/, '')

  return `${protocol || req.protocol}://${req.get('host')}`
}

/**
 * Composes and returns the fully-qualified URI for the request, to be used
 * as a base URI for RDF parsing or serialization. For example, if a request
 * is to `Host: example.com`, `GET /files/` using the `https:` protocol,
 * then:
 *
 *   ```
 *   getFullUri(req)  // -> 'https://example.com/files/'
 *   ```
 *
 * @param req {IncomingMessage}
 *
 * @return {string}
 */
function getFullUri (req) {
  return getBaseUri(req) + url.resolve(req.baseUrl, req.path)
}

function pathBasename (fullpath) {
  let bname = ''
  if (fullpath) {
    bname = (fullpath.lastIndexOf('/') === fullpath.length - 1)
      ? ''
      : path.basename(fullpath)
  }
  return bname
}

function hasSuffix (path, suffixes) {
  for (let i in suffixes) {
    if (path.indexOf(suffixes[i], path.length - suffixes[i].length) !== -1) {
      return true
    }
  }
  return false
}

function parse (data, baseUri, contentType, callback) {
  const graph = $rdf.graph()
  try {
    return $rdf.parse(data, graph, baseUri, contentType, callback)
  } catch (err) {
    return callback(err)
  }
}

/**
 * Reads a file, processes it (performing template substitution), and saves
 * back the processed result.
 *
 * @param filePath {string}
 * @param substitutions {Object}
 *
 * @return {Promise}
 */
async function processHandlebarFile (filePath, substitutions) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (error, rawSource) => {
      if (error) {
        return reject(error)
      }

      const output = processHandlebarTemplate(rawSource, substitutions)

      fs.writeFile(filePath, output, (error) => {
        if (error) {
          return reject(error)
        }
        resolve()
      })
    })
  })
}

/**
 * Performs a Handlebars string template substitution, and returns the
 * resulting string.
 *
 * @see https://www.npmjs.com/package/handlebars
 *
 * @param source {string} e.g. 'Hello, {{name}}'
 *
 * @return {string} Result, e.g. 'Hello, Alice'
 */
function processHandlebarTemplate (source, substitutions) {
  try {
    const template = Handlebars.compile(source)
    return template(substitutions)
  } catch (error) {
    debug(`Error processing template: ${error}`)
    return source
  }
}

function serialize (graph, baseUri, contentType, callback) {
  try {
    // target, kb, base, contentType, callback
    $rdf.serialize(null, graph, baseUri, contentType, function (err, result) {
      if (err) {
        console.log(err)
        return callback(err)
      }
      if (result === undefined) {
        return callback(new Error('Error serializing the graph to ' +
          contentType))
      }

      return callback(null, result)
    })
  } catch (err) {
    console.log(err)
    callback(err)
  }
}

function translate (stream, baseUri, from, to, callback) {
  // Handle Turtle Accept header
  if (to === 'text/turtle' ||
    to === 'text/n3' ||
    to === 'application/turtle' ||
    to === 'application/n3') {
    to = 'text/turtle'
  }

  let data = ''
  stream
    .on('data', function (chunk) {
      data += chunk
    })
    .on('end', function () {
      parse(data, baseUri, from, function (err, graph) {
        if (err) return callback(err)
        serialize(graph, baseUri, to, function (err, data) {
          if (err) return callback(err)
          callback(null, data)
        })
      })
    })
}

function stringToStream (string) {
  return from(function (size, next) {
    // if there's no more content
    // left in the string, close the stream.
    if (!string || string.length <= 0) {
      return next(null, null)
    }

    // Pull in a new chunk of text,
    // removing it from the string.
    const chunk = string.slice(0, size)
    string = string.slice(size)

    // Emit "chunk" from the stream.
    next(null, chunk)
  })
}

/**
 * Removes line endings from a given string. Used for WebID TLS Certificate
 * generation.
 *
 * @param obj {string}
 *
 * @return {string}
 */
function stripLineEndings (obj) {
  if (!obj) { return obj }

  return obj.replace(/(\r\n|\n|\r)/gm, '')
}

function reqToPath (req) {
  const ldp = req.app.locals.ldp
  const root = ldp.multiuser ? ldp.root + req.hostname + '/' : ldp.root
  return uriToFilename(req.path, root)
}

/**
 * Adds a route that serves a static file from another Node module
 */
function routeResolvedFile (router, path, file, appendFileName = true) {
  const fullPath = appendFileName ? path + file.match(/[^/]+$/) : path
  const fullFile = require.resolve(file)
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
}
