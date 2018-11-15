module.exports.uriToFilename = uriToFilename
module.exports.uriToRelativeFilename = uriToRelativeFilename
module.exports.getBaseUri = getBaseUri
module.exports.pathBasename = pathBasename
module.exports.getFullUri = getFullUri
module.exports.hasSuffix = hasSuffix
module.exports.parse = parse
module.exports.serialize = serialize
module.exports.translate = translate
module.exports.stringToStream = stringToStream
module.exports.reqToPath = reqToPath
module.exports.debrack = debrack
module.exports.stripLineEndings = stripLineEndings
module.exports.fullUrlForReq = fullUrlForReq
module.exports.routeResolvedFile = routeResolvedFile
module.exports.getQuota = getQuota
module.exports.overQuota = overQuota

const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const $rdf = require('rdflib')
const from = require('from2')
const url = require('url')
const debug = require('./debug').fs
const getSize = require('get-folder-size')
var ns = require('solid-namespace')($rdf)

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

/**
 * Returns the number of bytes that the user owning the requested POD
 * may store or Infinity if no limit
 */

async function getQuota (root, serverUri) {
  const filename = path.join(root, 'settings/serverSide.ttl')
  var prefs
  try {
    prefs = await _asyncReadfile(filename)
  } catch (error) {
    debug('Setting no quota. While reading serverSide.ttl, got ' + error)
    return Infinity
  }
  var graph = $rdf.graph()
  const storageUri = serverUri + '/'
  try {
    $rdf.parse(prefs, graph, storageUri, 'text/turtle')
  } catch (error) {
    throw new Error('Failed to parse serverSide.ttl, got ' + error)
  }
  return Number(graph.anyValue($rdf.sym(storageUri), ns.solid('storageQuota'))) || Infinity
}

/**
 * Returns true of the user has already exceeded their quota, i.e. it
 * will check if new requests should be rejected, which means they
 * could PUT a large file and get away with it.
 */

async function overQuota (root, serverUri) {
  let quota = await getQuota(root, serverUri)
  if (quota === Infinity) {
    return false
  }
  // TODO: cache this value?
  var size = await actualSize(root)
  console.log(size, quota)
  return (size > quota)
}

/**
 * Returns the number of bytes that is occupied by the actual files in
 * the file system. IMPORTANT NOTE: Since it traverses the directory
 * to find the actual file sizes, this does a costly operation, but
 * neglible for the small quotas we currently allow. If the quotas
 * grow bigger, this will significantly reduce write performance, and
 * so it needs to be rewritten.
 */

function actualSize (root) {
  return util.promisify(getSize)(root)
}

function _asyncReadfile (filename) {
  return util.promisify(fs.readFile)(filename, 'utf-8')
}
