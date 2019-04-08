module.exports.pathBasename = pathBasename
module.exports.hasSuffix = hasSuffix
module.exports.serialize = serialize
module.exports.translate = translate
module.exports.stringToStream = stringToStream
module.exports.debrack = debrack
module.exports.stripLineEndings = stripLineEndings
module.exports.fullUrlForReq = fullUrlForReq
module.exports.routeResolvedFile = routeResolvedFile
module.exports.getQuota = getQuota
module.exports.overQuota = overQuota
module.exports.getContentType = getContentType
module.exports.parse = parse

const fs = require('fs')
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

async function parse (data, baseUri, contentType) {
  const graph = $rdf.graph()
  return new Promise((resolve, reject) => {
    try {
      return $rdf.parse(data, graph, baseUri, contentType, (err, str) => {
        if (err) {
          return reject(err)
        }
        resolve(str)
      })
    } catch (err) {
      return reject(err)
    }
  })
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

function serialize (graph, baseUri, contentType) {
  return new Promise((resolve, reject) => {
    try {
      // target, kb, base, contentType, callback
      $rdf.serialize(null, graph, baseUri, contentType, function (err, result) {
        if (err) {
          return reject(err)
        }
        if (result === undefined) {
          return reject(new Error('Error serializing the graph to ' +
            contentType))
        }

        resolve(result)
      })
    } catch (err) {
      reject(err)
    }
  })
}

function translate (stream, baseUri, from, to) {
  return new Promise((resolve, reject) => {
    let data = ''
    stream
      .on('data', function (chunk) {
        data += chunk
      })
      .on('end', function () {
        const graph = $rdf.graph()
        $rdf.parse(data, graph, baseUri, from, function (err) {
          if (err) return reject(err)
          resolve(serialize(graph, baseUri, to))
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

/**
 * Get the content type from a headers object
 * @param headers An Express or Fetch API headers object
 * @return {string} A content type string
 */
function getContentType (headers) {
  const headerValue = headers.get ? headers.get('content-type') : headers['content-type']

  // Default content type as stated by RFC 822
  if (!headerValue) {
    return 'text/plain'
  }

  // Remove charset suffix
  return headerValue.split(';')[0]
}
