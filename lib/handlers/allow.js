module.exports = allow

const ACL = require('../acl-checker')
const $rdf = require('rdflib')
const utils = require('../utils')
const debug = require('../debug.js').ACL
const LegacyResourceMapper = require('../legacy-resource-mapper')

function allow (mode) {
  return function allowHandler (req, res, next) {
    const ldp = req.app.locals.ldp || {}
    if (!ldp.webid) {
      return next()
    }

    // Set up URL to filesystem mapping
    const rootUrl = utils.getBaseUri(req)
    const mapper = new LegacyResourceMapper({
      rootUrl,
      rootPath: ldp.root,
      includeHost: ldp.multiuser
    })

    // Determine the actual path of the request
    let reqPath = res && res.locals && res.locals.path
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
      req.acl = new ACL(rootUrl + reqPath, {
        origin: req.get('origin'),
        host: req.protocol + '://' + req.get('host'),
        fetch: fetchFromLdp(mapper, ldp),
        suffix: ldp.suffixAcl,
        strictOrigin: ldp.strictOrigin
      })

      // Ensure the user has the required permission
      const userId = req.session.userId
      req.acl.can(userId, mode)
        .then(() => next(), err => {
          debug(`${mode} access denied to ${userId || '(none)'}`)
          next(err)
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
 * @return {Function} Returns a `fetch(uri, callback)` handler
 */
function fetchFromLdp (mapper, ldp) {
  return function fetch (url, callback) {
    // Convert the URL into a filename
    mapper.mapUrlToFile({ url })
    // Read the file from disk
    .then(({ path }) => new Promise((resolve, reject) => {
      ldp.readFile(path, (e, c) => e ? reject(e) : resolve(c))
    }))
    // Parse the file as Turtle
    .then(body => {
      const graph = $rdf.graph()
      $rdf.parse(body, graph, url, 'text/turtle')
      return graph
    })
    // Return the ACL graph
    .then(graph => callback(null, graph), callback)
  }
}
