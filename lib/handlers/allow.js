module.exports = allow

const $rdf = require('rdflib')
const path = require('path')
const ACL = require('../acl-checker')
const debug = require('../debug.js').ACL
const fs = require('fs')
const { promisify } = require('util')
const HTTPError = require('../http-error')

function allow (mode, relativePath = '') {
  return async function allowHandler (req, res, next) {
    const ldp = req.app.locals.ldp || {}
    if (!ldp.webid) {
      return next()
    }

    // Set up URL to filesystem mapping
    const rootUrl = ldp.resourceMapper.resolveUrl(req.hostname)

    // Determine the actual path of the request
    // (This is used as an ugly hack to check the ACL status of other resources.)
    let reqPath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

    // If a relativePath has been provided, check permissions based on that
    if (relativePath) {
      reqPath = path.join(reqPath, relativePath)
    }

    // Check whether the resource exists
    let stat
    try {
      const ret = await ldp.exists(req.hostname, reqPath)
      stat = ret.stream
    } catch (err) {
      stat = null
    }

    // Ensure directories always end in a slash
    if (!reqPath.endsWith('/') && stat && stat.isDirectory()) {
      reqPath += '/'
    }

    // Obtain and store the ACL of the requested resource
    req.acl = new ACL(rootUrl + reqPath, {
      agentOrigin: req.get('origin'),
      // host: req.get('host'),
      fetch: fetchFromLdp(ldp.resourceMapper),
      fetchGraph: (uri, options) => {
        // first try loading from local fs
        return ldp.getGraph(uri, options.contentType)
        // failing that, fetch remote graph
          .catch(() => ldp.fetchGraph(uri, options))
      },
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin,
      trustedOrigins: ldp.trustedOrigins
    })

    // Ensure the user has the required permission
    const userId = req.session.userId
    const isAllowed = await req.acl.can(userId, mode)
    if (isAllowed) {
      return next()
    }
    const error = await req.acl.getError(userId, mode)
    debug(`${mode} access denied to ${userId || '(none)'}: ${error.status} - ${error.message}`)
    next(error)
  }
}

/**
 * Returns a fetch document handler used by the ACLChecker to fetch .acl
 * resources up the inheritance chain.
 * The `fetch(uri, callback)` results in the callback, with either:
 *   - `callback(err, graph)` if any error is encountered, or
 *   - `callback(null, graph)` with the parsed RDF graph of the fetched resource
 * @return {Function} Returns a `fetch(uri, callback)` handler
 */
function fetchFromLdp (mapper) {
  return async function fetch (url, graph = $rdf.graph()) {
    // Convert the URL into a filename
    let path, contentType
    try {
      ({ path, contentType } = await mapper.mapUrlToFile({ url }))
    } catch (err) {
      throw new HTTPError(404, err)
    }
    // Read the file from disk
    const body = await promisify(fs.readFile)(path, {'encoding': 'utf8'})
    // Parse the file as Turtle
    $rdf.parse(body, graph, url, contentType)
    return graph
  }
}
