module.exports = allow

const path = require('path')
const ACL = require('../acl-checker')
const debug = require('../debug.js').ACL

function allow (mode, checkPermissionsForDirectory) {
  return async function allowHandler (req, res, next) {
    const ldp = req.app.locals.ldp || {}
    if (!ldp.webid) {
      return next()
    }

    // Set up URL to filesystem mapping
    const rootUrl = ldp.resourceMapper.resolveUrl(req.hostname)

    // Determine the actual path of the request
    // (This is used as an ugly hack to check the ACL status of other resources.)
    let resourcePath = res && res.locals && res.locals.path
      ? res.locals.path
      : req.path

    // Check permissions of the directory instead of the file itself.
    if (checkPermissionsForDirectory) {
      resourcePath = path.dirname(resourcePath)
    }

    // Check whether the resource exists
    let stat
    try {
      const ret = await ldp.exists(req.hostname, resourcePath)
      stat = ret.stream
    } catch (err) {
      stat = null
    }

    // Ensure directories always end in a slash
    if (!resourcePath.endsWith('/') && stat && stat.isDirectory()) {
      resourcePath += '/'
    }

    let trustedOrigins = [ldp.resourceMapper.resolveUrl(req.hostname)].concat(ldp.trustedOrigins)
    if (ldp.multiuser) {
      trustedOrigins.push(ldp.serverUri)
    }
    // Obtain and store the ACL of the requested resource
    const resourceUrl = rootUrl + resourcePath
    req.acl = ACL.createFromLDPAndRequest(resourceUrl, ldp, req)

    // Ensure the user has the required permission
    const userId = req.session.userId
    const isAllowed = await req.acl.can(userId, mode)
    if (isAllowed) {
      return next()
    }
    if (mode === 'Read' && (resourcePath === '' || resourcePath === '/')) {
      // This is a hack to make NSS check the ACL for representation that is served for root (if any)
      // See https://github.com/solid/node-solid-server/issues/1063 for more info
      const representationUrl = `${rootUrl}/index.html`
      let representationPath
      try {
        representationPath = await ldp.resourceMapper.mapUrlToFile({ url: representationUrl })
      } catch (err) {
      }

      // We ONLY want to do this when the HTML representation exists
      if (representationPath) {
        req.acl = ACL.createFromLDPAndRequest(representationUrl, ldp, req)
        const representationIsAllowed = await req.acl.can(userId, mode)
        if (representationIsAllowed) {
          return next()
        }
      }
    }
    const error = req.authError || await req.acl.getError(userId, mode)
    debug(`${mode} access denied to ${userId || '(none)'}: ${error.status} - ${error.message}`)
    next(error)
  }
}
