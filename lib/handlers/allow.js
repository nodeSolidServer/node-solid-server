module.exports.allow = allow

var ACL = require('../acl-checker')
var $rdf = require('rdflib')
var ns = require('solid-namespace')($rdf)
var url = require('url')
var async = require('async')
var debug = require('../debug').ACL
var utils = require('../utils')

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function allow (mode) {
  return function allowHandler (req, res, next) {
    var ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }
    var baseUri = utils.uriBase(req)

    var acl = new ACL({
      debug: debug,
      fetch: documentFetcher(req.hostname, ldp, baseUri),
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin
    })

    getUserId(req, function (err, userId) {
      if (err) return next(err)

      var reqPath = res && res.locals && res.locals.path
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
  }
}

/**
 * Returns a fetch document handler used by the ACLChecker to fetch .acl
 * resources up the inheritance chain.
 * The `fetch(uri, callback)` results in the callback, with either:
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
    var graph = $rdf.graph()
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
          $rdf.parse(body, graph, uri, 'text/turtle')
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
 * @method getUserId
 * @param req
 * @param callback {Function}
 * @return {string} Callback with the user id (either the current user, or
 *   the user being delegated for).
 */
function getUserId (req, callback) {
  let webId = req.session.userId
  let principal = utils.debrack(req.get('On-Behalf-Of'))
  if (!webId || !principal) {
    return callback(null, webId)
  }
  // WebID Delegation header present, verify secretary and return the principal
  let secretary = webId
  let ldp = req.app.locals.ldp
  let baseUri = utils.uriBase(req)
  let fetchDocument = documentFetcher(req.hostname, ldp, baseUri)
  debug('Verifying delegator (secretary agent) ', secretary,
    ' representing ', principal)

  verifyDelegator(fetchDocument, secretary, principal, (err, verified) => {
    if (err) { return callback(err) }
    if (verified) {
      debug('Request User ID (via delegation): ' + principal)
      return callback(null, principal)
    } else {
      debug('Secretary agent not authorized: ' + secretary)
      return callback(null, secretary)
    }
  })
}

/**
 * @see https://www.w3.org/wiki/WebID/Delegation
 * @see https://github.com/seebi/WebID-Delegation-paper
 *
 * @param fetchDocument {Function} Result of `documentFetcher()` call
 * @param secretary {string} Web ID of the delegator agent. Acts on behalf of the
 *   principal.
 * @param principal {string} Web ID of the secretary's "owner". Authorizes
 *   the secretary to act on the principal's behalf.
 * @param callback {Function}
 * @return {Boolean} Callback with whether or not delegator is verified
 */
function verifyDelegator (fetchDocument, secretary, principal, callback) {
  // Fetch the principal's WebID Profile document
  fetchDocument(principal, function (err, profileGraph) {
    if (err) {
      debug("Error fetching the principal's profile: ", err)
      err.status = 500
      return callback(err)
    }
    let authorizedMatches = profileGraph
      .match(
        $rdf.namedNode(principal),
        ns.acl('delegates'),
        $rdf.namedNode(secretary)
      )
    let isAuthorized = authorizedMatches.length > 0
    return callback(null, isAuthorized)
  })
}
