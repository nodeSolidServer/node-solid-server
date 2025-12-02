/* eslint-disable node/no-deprecated-api */

import fs from 'fs'
import path from 'path'
import util from 'util'
import $rdf from 'rdflib'
import from from 'from2'
import url from 'url'
import { fs as debug } from './debug.mjs'
import getSize from 'get-folder-size'
import vocab from 'solid-namespace'

const nsObj = vocab($rdf)

/**
 * Returns a fully qualified URL from an Express.js Request object.
 * (It's insane that Express does not provide this natively.)
 *
 * Usage:
 *
 *   ```
 *   var fullURL = utils.fullUrlForReq(req)
 *   ```
 *
 * @method fullUrlForReq
 *
 * @param req {IncomingMessage} Express.js request object
 *
 * @return {string} Fully qualified URL of the request
 */
export function fullUrlForReq (req) {
  // Determine protocol: prefer explicit `req.protocol`, then `req.secure` or X-Forwarded-Proto
  let protocol = 'http'
  if (req && req.protocol) {
    protocol = String(req.protocol).replace(/:$/, '')
  } else if (req && (req.secure || (req.get && req.get('X-Forwarded-Proto') === 'https'))) {
    protocol = 'https'
  }

  const host = (req && req.get && req.get('host')) || (req && req.headers && req.headers.host) || ''

  // Prefer originalUrl when present (Express combines path + query), otherwise build from parts
  if (req && req.originalUrl) {
    return protocol + '://' + host + req.originalUrl
  }

  const base = (req && req.baseUrl) || ''
  const pth = (req && req.path) || ''
  let qs = ''
  if (req && req.query && Object.keys(req.query).length) {
    qs = '?' + new URLSearchParams(req.query).toString()
  }

  // Join base and path while avoiding duplicate slashes (e.g. '/' + '/resource')
  let pathPart = (base || '') + (pth || '')
  if (pathPart) {
    pathPart = pathPart.replace(/\/\/+/, '/')
    // collapse repeated slashes into one
    pathPart = pathPart.replace(/\/\/+/, '/')
    // ensure leading slash
    if (!pathPart.startsWith('/')) pathPart = '/' + pathPart
  } else {
    pathPart = ''
  }

  return protocol + '://' + host + pathPart + qs
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
  const fullFile = import.meta.resolve(file)
  router.get(fullPath, (req, res) => res.sendFile(fullFile))
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
  if (!fullpath) return ''
  if (fullpath.endsWith('/')) return ''

  let bname = path.basename(fullpath)
  if (hasSuffix(bname, '.ttl')) {
    bname = bname.substring(0, bname.length - 4)
  } else if (hasSuffix(bname, '.jsonld')) {
    bname = bname.substring(0, bname.length - 7)
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
export function hasSuffix (str, suffix) {
  if (!str || str.length === 0) {
    return false
  }
  return str.indexOf(suffix, str.length - suffix.length) !== -1
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
  // Implementation placeholder
  return $rdf.serialize(graph, base, contentType)
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
export function translate (contentType) {
  if (contentType) {
    if (contentType === 'text/n3' || contentType === 'text/turtle' || contentType === 'application/turtle') {
      return 'text/turtle'
    }
    if (contentType === 'application/rdf+xml') {
      return 'application/rdf+xml'
    }
    if (contentType === 'application/xhtml+xml') {
      return 'application/xhtml+xml'
    }
    if (contentType === 'text/html') {
      return 'text/html'
    }
    if (contentType.includes('json')) {
      return 'application/ld+json'
    }
  }
  return contentType
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
    if (string.length <= 0) return next(null, null)
    const chunk = string.slice(0, size)
    string = string.slice(size)
    next(null, chunk)
  })
}

/**
 * Removes opening and closing angle brackets from a string.
 * 
 * @method debrack
 * @param str {string}
 * @return {string}
 */
export function debrack (str) {
  if (str == null) return null
  if (str && str.startsWith && str.startsWith('<') && str.endsWith && str.endsWith('>')) {
    return str.substring(1, str.length - 1)
  }
  return str
}

/**
 * Removes line ending characters (\n and \r) from a string.
 *
 * @method stripLineEndings
 * @param str {string}
 * @return {string}
 */
export function stripLineEndings (str) {
  if (str === null) return null
  if (str === undefined) return undefined
  return String(str).replace(/[\r\n]/g, '')
}

/**
 * Returns the quota for a user in a root
 * @param root
 * @param serverUri
 * @returns {Promise<Number>} The quota in bytes
 */
export async function getQuota (root, serverUri) {
  let prefs
  try {
    prefs = await _asyncReadfile(path.join(root, 'settings/serverSide.ttl'))
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
 * Parse RDF content based on content type.
 *
 * @method parse
 * @param graph {Graph} rdflib Graph object to parse into
 * @param data {string} Data to parse
 * @param base {string} Base URL
 * @param contentType {string} Content type
 * @return {Graph} The parsed graph
 */
export function parse (graph, data, base, contentType) {
  // Implementation placeholder - need to check original implementation
  return $rdf.parse(data, graph, base, translate(contentType))
}