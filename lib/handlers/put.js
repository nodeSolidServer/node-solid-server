module.exports = handler

const bodyParser = require('body-parser')
const debug = require('debug')('solid:put')
const getContentType = require('../utils').getContentType
const HTTPError = require('../http-error')
const { stringToStream } = require('../utils')

async function handler (req, res, next) {
  debug(req.originalUrl)
  // deprecated kept for compatibility
  res.header('MS-Author-Via', 'SPARQL') // is this needed ?
  const contentType = req.get('content-type')

  // check whether a folder or resource with same name exists
  try {
    const ldp = req.app.locals.ldp
    await ldp.checkItemName(req)
  } catch (e) {
    return next(e)
  }
  // check for valid rdf content for auxiliary resource and /profile/card
  // TODO check that /profile/card is a minimal valid WebID card
  if (isAuxiliary(req) || req.originalUrl === '/profile/card') {
    if (contentType === 'text/turtle') {
      return bodyParser.text({ type: () => true })(req, res, () => putValidRdf(req, res, next))
    } else return next(new HTTPError(415, 'RDF file contains invalid syntax'))
  }
  return putStream(req, res, next)
}

// Verifies whether the user is allowed to perform Append PUT on the target
async function checkPermission (request, resourceExists) {
  // If no ACL object was passed down, assume permissions are okay.
  if (!request.acl) return Promise.resolve()
  // At this point, we already assume append access,
  // we might need to perform additional checks.
  let modes = []
  // acl:default Write is required for PUT when Resource Exists
  if (resourceExists) modes = ['Write']
  // if (resourceExists && request.originalUrl.endsWith('.acl')) modes = ['Control']
  const { acl, session: { userId } } = request

  const allowed = await Promise.all(modes.map(mode => acl.can(userId, mode, request.method, resourceExists)))
  const allAllowed = allowed.reduce((memo, allowed) => memo && allowed, true)
  if (!allAllowed) {
    // check owner with Control
    // const ldp = request.app.locals.ldp
    // if (request.path.endsWith('.acl') && userId === await ldp.getOwner(request.hostname)) return Promise.resolve()

    const errors = await Promise.all(modes.map(mode => acl.getError(userId, mode)))
    const error = errors.filter(error => !!error)
      .reduce((prevErr, err) => prevErr.status > err.status ? prevErr : err, { status: 0 })
    return Promise.reject(error)
  }
  return Promise.resolve()
}

// TODO could be renamed as putResource (it now covers container and non-container)
async function putStream (req, res, next, stream = req) {
  const ldp = req.app.locals.ldp
  // try {
  // Obtain details of the target resource
  let resourceExists = true
  try {
    // First check if the file already exists
    await ldp.resourceMapper.mapUrlToFile({ url: req })
    // Fails on if-none-match asterisk precondition
    if ((req.headers['if-none-match'] === '*') && !req.path.endsWith('/')) {
      res.sendStatus(412)
      return next()
    }
  } catch (err) {
    resourceExists = false
  }
  try {
    // Fails with Append on existing resource
    if (!req.originalUrl.endsWith('.acl')) await checkPermission(req, resourceExists)
    await ldp.put(req, stream, getContentType(req.headers))

    // Add event-id for notifications
    res.setHeader('Event-ID', res.setEventID())

    res.sendStatus(201)
    return next()
  } catch (err) {
    err.message = 'Can\'t write file/folder: ' + err.message
    return next(err)
  }
}

// needed to avoid breaking access with bad acl
// or breaking containement triples for meta
function putValidRdf (req, res, next) {
  const ldp = req.app.locals.ldp
  const contentType = req.get('content-type')
  const requestUri = ldp.resourceMapper.getRequestUrl(req)

  if (ldp.isValidRdf(req.body, requestUri, contentType)) {
    const stream = stringToStream(req.body)
    return putStream(req, res, next, stream)
  }
  next(new HTTPError(400, 'RDF file contains invalid syntax'))
}

function isAuxiliary (req) {
  const originalUrlParts = req.originalUrl.split('.')
  const ext = originalUrlParts[originalUrlParts.length - 1]
  return (ext === 'acl' || ext === 'meta')
}
