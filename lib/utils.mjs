/* eslint-disable node/no-deprecated-api */

import fs from 'fs'
import path from 'path'
import util from 'util'
import $rdf from 'rdflib'
import from from 'from2'
import url, { fileURLToPath } from 'url'
import debugModule from './debug.mjs'
import getSize from 'get-folder-size'
import vocab from 'solid-namespace'

const nsObj = vocab($rdf)
const debug = debugModule.fs
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
 * @method fullUrlForReq
 *
 * @param req {IncomingRequest} Express.js request object
 *
 * @return {string} Fully qualified URL of the request
 */
export function fullUrlForReq (req) {
  const fullUrl = url.format({
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
export function debrack (s) {
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

/**
 * Parse RDF content based on content type.
 *
 * @method parse
 * @param graph {Graph} rdflib Graph object to parse into
 * @param data {string} Data to parse
 * @param base {string} Base URL
 * @param contentType {string} Content type
 * @return {Graph} The parsed graph
 */
export async function parse (data, baseUri, contentType) {
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

/**
 * Returns the base filename (without directory) for a given path.
 *
 * @method pathBasename
 *
 * @param fullpath {string}
 *
 * @return {string}
 */
export function pathBasename (fullpath) {
  let bname = ''
  if (fullpath) {
    bname = (fullpath.lastIndexOf('/') === fullpath.length - 1)
      ? ''
      : path.basename(fullpath)
  }
  return bname
}

/**
 * Checks to see whether a string has the given suffix.
 *
 * @method hasSuffix
 *
 * @param str {string}
 * @param suffix {string}
 *
 * @return {boolean}
 */
export function hasSuffix (path, suffixes) {
  for (const i in suffixes) {
    if (path.indexOf(suffixes[i], path.length - suffixes[i].length) !== -1) {
      return true
    }
  }
  return false
}

/**
 * Serializes an `rdflib` graph to a string.
 *
 * @method serialize
 *
 * @param graph {Graph} rdflib Graph object
 * @param base {string} Base URL
 * @param contentType {string}
 *
 * @return {string}
 */
export function serialize (graph, base, contentType) {
  return new Promise((resolve, reject) => {
    try {
      // target, kb, base, contentType, callback
      $rdf.serialize(null, graph, base, contentType, function (err, result) {
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

/**
 * Translates common RDF content types to `rdflib` parser names.
 *
 * @method translate
 *
 * @param contentType {string}
 *
 * @return {string}
 */
export function translate (stream, baseUri, from, to) {
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

/**
 * Converts a given string to a Node.js Readable Stream.
 *
 * @method stringToStream
 *
 * @param string {string}
 *
 * @return {ReadableStream}
 */
export function stringToStream (string) {
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
 * Removes line ending characters (\n and \r) from a string.
 *
 * @method stripLineEndings
 * @param str {string}
 * @return {string}
 */
export function stripLineEndings (obj) {
  if (!obj) { return obj }

  return obj.replace(/(\r\n|\n|\r)/gm, '')
}

/**
 * Routes the resolved file. Serves static files with content negotiation.
 *
 * @method routeResolvedFile
 * @param req {IncomingMessage} Express.js request object
 * @param res {ServerResponse} Express.js response object
 * @param file {string} resolved filename
 * @param contentType {string} MIME type of the resolved file
 * @param container {boolean} whether this is a container
 * @param next {Function} Express.js next callback
 */
export function routeResolvedFile (router, path, file, appendFileName = true) {
  const fullPath = appendFileName ? path + file.match(/[^/]+$/) : path
  const fullFile = fileURLToPath(import.meta.resolve(file))
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
}

/**
 * Returns the quota for a user in a root
 * @param root
 * @param serverUri
 * @returns {Promise<Number>} The quota in bytes
 */
export async function getQuota (root, serverUri) {
  const filename = path.join(root, 'settings/serverSide.ttl')
  debug('Reading quota from ' + filename)
  let prefs
  try {
    prefs = await _asyncReadfile(filename)
  } catch (error) {
    debug('Setting no quota. While reading serverSide.ttl, got ' + error)
    return Infinity
  }
  const graph = $rdf.graph()
  const storageUri = serverUri.endsWith('/') ? serverUri : serverUri + '/'
  try {
    $rdf.parse(prefs, graph, storageUri, 'text/turtle')
  } catch (error) {
    throw new Error('Failed to parse serverSide.ttl, got ' + error)
  }
  return Number(graph.anyValue($rdf.sym(storageUri), nsObj.solid('storageQuota'))) || Infinity
}

/**
 * Returns true of the user has already exceeded their quota, i.e. it
 * will check if new requests should be rejected, which means they
 * could PUT a large file and get away with it.
 */
export async function overQuota (root, serverUri) {
  const quota = await getQuota(root, serverUri)
  if (quota === Infinity) {
    return false
  }
  // TODO: cache this value?
  const size = await actualSize(root)
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
export function getContentType (headers) {
  const value = headers.get ? headers.get('content-type') : headers['content-type']
  return value ? value.replace(/;.*/, '') : ''
}
