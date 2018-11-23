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
    // (This is used as an ugly hack to check the ACL status of other resources.)
    let reqPath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

    // Check whether the resource exists
    ldp.exists(req.hostname, reqPath, async (err, ret) => {
      // Ensure directories always end in a slash
      const stat = err ? null : ret.stream
      if (!reqPath.endsWith('/') && stat && stat.isDirectory()) {
        reqPath += '/'
      }

      // Obtain and store the ACL of the requested resource
      req.acl = new ACL(rootUrl + reqPath, {
        agentOrigin: req.get('origin'),
        // host: req.get('host'),
        fetch: fetchFromLdp(mapper, ldp),
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
      console.log('ERROR', error)
      debug(`${mode} access denied to ${userId || '(none)'}: ${error.status} - ${error.message}`)
      next(error)
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
  return async function fetch (url, graph = $rdf.graph()) {
    // Convert the URL into a filename
    const { path } = await mapper.mapUrlToFile({ url })
    // Read the file from disk
    const body = await new Promise((resolve, reject) => {
      ldp.readFile(path, (e, c) => e ? reject(e) : resolve(c))
    })
    // Parse the file as Turtle
    console.log('OLD GRAPH - merge', graph.length)
    $rdf.parse(body, graph, url, 'text/turtle')
    console.log('NEW GRAPH - merge', graph.length)
    return graph
  }
}
