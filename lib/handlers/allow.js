module.exports.allow = allow
module.exports.getRequestingWebId = getRequestingWebId
module.exports.verifyDelegator = verifyDelegator

var ACL = require('../acl-checker')
var rdf = require('rdflib')
var ns = require('solid-namespace')(rdf)
var url = require('url')
var async = require('async')
var debug = require('../debug').ACL
var utils = require('../utils')

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

/**
 * Provides an Express middleware ACL handler that checks that a request's
 * agent is allowed the specified access control mode ('Read', 'Write', etc).
 *
 * @see https://github.com/solid/web-access-control-spec
 *
 * Sample usage (in LDP middleware):
 *
 *   ```
 *   const acl = require('./handlers/allow')
 *   router.put('/*', acl.allow('Write'), put)
 *   ```
 *
 * @method allow
 * @param mode {string}
 * @returns {allowHandler}
 */
function allow (mode) {
  return function allowHandler (req, res, next) {
    let ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }
    let baseUri = utils.uriBase(req)

    let fetchDocument = documentFetcher(req.hostname, ldp, baseUri)

    var acl = new ACL({
      debug: debug,
      fetch: fetchDocument,
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin
    })

    let webId = req.session.userId
    let onBehalfOf = utils.debrack(req.get('On-Behalf-Of'))
    getRequestingWebId(webId, onBehalfOf, fetchDocument)
      .then(userId => {
        let reqPath = res && res.locals && res.locals.path
          ? res.locals.path
          : req.path
        ldp.exists(req.hostname, reqPath, (err, ret) => {
          if (ret) {
            var stat = ret.stream
          }
          if (!reqPath.endsWith('/') && !err && stat.isDirectory()) {
            reqPath += '/'
          }
          var options = {
            origin: req.get('origin'),
            host: req.protocol + '://' + req.get('host')
          }
          return acl.can(userId, mode, baseUri + reqPath, next, options)
        })
      })
      .catch(err => {
        next(err)
      })
  }
}

/**
 * Returns a fetch document handler used by the ACLChecker to fetch .acl
 * resources up the inheritance chain.
 * The `fetchDocument(uri, callback)` results in the callback, with either:
 *   - `callback(err, graph)` if any error is encountered, or
 *   - `callback(null, graph)` with the parsed RDF graph of the fetched resource
 * @method documentFetcher
 * @param host {string} req.hostname. Used in determining the location of the
 *   document on the file system (the root directory)
 * @param ldp {LDP} LDP instance
 * @param baseUri {string} Base URI of the solid server (including any root
 *   mount), for example `https://example.com/solid`
 * @return {Function} Returns a `fetchDocument(uri, callback)` handler
 */
function documentFetcher (host, ldp, baseUri) {
  return function fetchDocument (uri, callback) {
    var graph = rdf.graph()
    async.waterfall([
      function readFile (cb) {
        // If local request, slice off the initial baseUri
        // S(uri).chompLeft(baseUri).s
        var newPath = uri.startsWith(baseUri)
          ? uri.slice(baseUri.length)
          : uri
        // Determine the root file system folder to look in
        // TODO prettify this
        var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
        // Derive the file path for the resource
        var documentPath = utils.uriToFilename(newPath, root)
        var documentUri = url.parse(documentPath)
        documentPath = documentUri.pathname
        return ldp.readFile(documentPath, cb)
      },
      function parseFile (body, cb) {
        try {
          rdf.parse(body, graph, uri, 'text/turtle')
        } catch (err) {
          return cb(err, graph)
        }
        return cb(null, graph)
      }
    ], callback)
  }
}

/**
 * Determines the id of the current user from one of the following:
 *
 * - From `On-Behalf-Of` header (if it's present AND secretary is authorized)
 * - From `session.userId` (if no delegation header, or secretary unauthorized)
 *
 * @method getRequestingWebId
 * @param webId {string} Current user, from session.userId
 * @param onBehalfOf {string} Contents of the `On-Behalf-Of` delegation header
 * @param fetchDocument {Function} Result of `documentFetcher()` call
 * @return {Promise<string>} The user id (either the current user, or
 *   the user being delegated for).
 */
function getRequestingWebId (webId, onBehalfOf, fetchDocument) {
  if (onBehalfOf && !webId) {
    let error = new Error('Invalid request - On-Behalf-Of present but no Web ID')
    error.status = 400
    return Promise.reject(error)
  }

  if (!webId) {
    return Promise.resolve(null)
  }

  if (webId && !onBehalfOf) {
    return Promise.resolve(webId)
  }

  // WebID Delegation header present, verify secretary and return the principal
  let secretary = webId
  let principal = onBehalfOf
  debug('Verifying delegator (secretary agent) ', secretary,
    ' representing ', principal)

  return verifyDelegator(secretary, principal, fetchDocument)
    .then(verified => {
      if (verified) {
        debug('Request User ID (via delegation): ' + principal)
        return principal
      } else {
        debug('Secretary agent not authorized: ' + secretary)
        return secretary
      }
    })
}

/**
 * @see https://www.w3.org/wiki/WebID/Delegation
 * @see https://github.com/seebi/WebID-Delegation-paper
 * @param secretary {string} Web ID of the delegator agent. Acts on behalf of the
 *   principal.
 * @param principal {string} Web ID of the secretary's "owner". Authorizes
 *   the secretary to act on the principal's behalf.
 * @param fetchDocument {Function} Result of `documentFetcher()` call
 * @throws {Error}
 * @return {Promise<Boolean>} Whether or not delegator is verified
 */
function verifyDelegator (secretary, principal, fetchDocument) {
  return new Promise((resolve, reject) => {
    // Fetch the principal's WebID Profile document
    fetchDocument(principal, (err, profileGraph) => {
      if (err) {
        debug("Error fetching the principal's profile: ", err)
        return reject(err)
      }
      let authorizedMatches = profileGraph
        .match(
          rdf.namedNode(principal),
          ns.acl('delegates'),
          rdf.namedNode(secretary)
        )
      let isAuthorized = authorizedMatches.length > 0
      resolve(isAuthorized)
    })
  })
}
