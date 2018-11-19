module.exports = allow

const ACL = require('../acl-checker')
const debug = require('../debug.js').ACL

function allow (mode) {
  return async function allowHandler (req, res, next) {
    const ldp = req.app.locals.ldp || {}
    if (!ldp.webid) {
      return next()
    }

    // Set up URL to filesystem mapping
    const rootUrl = ldp.resourceMapper.getBaseUrl(req.hostname)

    // Determine the actual path of the request
    // (This is used as an ugly hack to check the ACL status of other resources.)
    let reqPath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

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
      origin: req.get('origin'),
      host: req.protocol + '://' + req.get('host'),
      fetch: fetchFromLdp(ldp.resourceMapper, ldp),
      fetchGraph: (uri, options) => {
        // first try loading from local fs
        return ldp.getGraph(uri, options.contentType)
        // failing that, fetch remote graph
          .catch(() => ldp.fetchGraph(uri, options))
      },
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
    ldp.getGraph(url).then(g => callback(null, g), callback)
  }
}
