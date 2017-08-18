module.exports = allow

var ACL = require('../acl-checker')
var $rdf = require('rdflib')
var url = require('url')
var async = require('async')
var utils = require('../utils')

function allow (mode) {
  return function allowHandler (req, res, next) {
    var ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }

    // Determine the actual path of the request
    var reqPath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

    // Check whether the resource exists
    ldp.exists(req.hostname, reqPath, (err, ret) => {
      // Ensure directories always end in a slash
      const stat = err ? null : ret.stream
      if (!reqPath.endsWith('/') && stat && stat.isDirectory()) {
        reqPath += '/'
      }

      // Obtain and store the ACL of the requested resource
      const baseUri = utils.uriBase(req)
      req.acl = new ACL(baseUri + reqPath, {
        origin: req.get('origin'),
        host: req.protocol + '://' + req.get('host'),
        fetch: fetchDocument(req.hostname, ldp, baseUri),
        suffix: ldp.suffixAcl,
        strictOrigin: ldp.strictOrigin
      })

      // Ensure the user has the required permission
      req.acl.can(req.session.userId, mode)
             .then(() => next(), next)
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
