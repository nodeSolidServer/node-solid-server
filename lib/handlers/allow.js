module.exports = {
  allow,
  userIdFromRequest
}

var ACL = require('../acl-checker')
var $rdf = require('rdflib')
var url = require('url')
var async = require('async')
var debug = require('../debug').ACL
var utils = require('../utils')

function allow (mode) {
  return function allowHandler (req, res, next) {
    var ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }
    var baseUri = utils.uriBase(req)

    var acl = new ACL({
      debug: debug,
      fetch: fetchDocument(req.hostname, ldp, baseUri),
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin
    })
    req.acl = acl

    getUserId(req, function (err, userId) {
      if (err) return next(err)
      req.userId = userId

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
 * @method fetchDocument
 * @param host {string} req.hostname. Used in determining the location of the
 *   document on the file system (the root directory)
 * @param ldp {LDP} LDP instance
 * @param baseUri {string} Base URI of the solid server (including any root
 *   mount), for example `https://example.com/solid`
 * @return {Function} Returns a `fetch(uri, callback)` handler
 */
function fetchDocument (host, ldp, baseUri) {
  return function fetch (uri, callback) {
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
 * Extracts the Web ID from the request object (for purposes of access control).
 *
 * @param req {IncomingRequest}
 *
 * @return {string|null} Web ID
 */
function userIdFromRequest (req) {
  let userId
  let locals = req.app.locals

  if (req.session.userId) {
    userId = req.session.userId
  } else if (locals.authMethod === 'oidc') {
    userId = locals.oidc.webIdFromClaims(req.claims)
  }

  return userId
}

function getUserId (req, callback) {
  let userId = userIdFromRequest(req)

  callback(null, userId)
  // var onBehalfOf = req.get('On-Behalf-Of')
  // if (!onBehalfOf) {
  //   return callback(null, req.session.userId)
  // }
  //
  // var delegator = utils.debrack(onBehalfOf)
  // verifyDelegator(req.hostname, delegator, req.session.userId,
  //   function (err, res) {
  //     if (err) {
  //       err.status = 500
  //       return callback(err)
  //     }
  //
  //     if (res) {
  //       debug('Request User ID (delegation) :' + delegator)
  //       return callback(null, delegator)
  //     }
  //     return callback(null, req.session.userId)
  //   })
}

// function verifyDelegator (host, ldp, baseUri, delegator, delegatee, callback) {
//   fetchDocument(host, ldp, baseUri)(delegator, function (err, delegatorGraph) {
//     // TODO handle error
//     if (err) {
//       err.status = 500
//       return callback(err)
//     }
//
//     var delegatesStatements = delegatorGraph
//       .each(delegatorGraph.sym(delegator),
//         delegatorGraph.sym('http://www.w3.org/ns/auth/acl#delegates'),
//         undefined)
//
//     for (var delegateeIndex in delegatesStatements) {
//       var delegateeValue = delegatesStatements[delegateeIndex]
//       if (utils.debrack(delegateeValue.toString()) === delegatee) {
//         callback(null, true)
//       }
//     }
//     // TODO check if this should be false
//     return callback(null, false)
//   })
// }
/**
 * Callback used by verifyDelegator.
 * @callback ACL~verifyDelegator_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {Boolean} result verification has passed or not
 */
