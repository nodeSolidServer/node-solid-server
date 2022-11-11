module.exports = handler

const bodyParser = require('body-parser')
const debug = require('debug')('solid:put')
const getContentType = require('../utils').getContentType
const HTTPError = require('../http-error')
const { stringToStream } = require('../utils')

async function handler (req, res, next) {
  debug(req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  const contentType = req.get('content-type')
  // check for valid rdf content for auxiliary resource and /profile/card
  // in future we may check that /profile/card is a minimal valid WebID card
  if (isAuxiliary(req) || req.originalUrl === '/profile/card') {
    if (contentType === 'text/turtle') {
      return bodyParser.text({ type: () => true })(req, res, () => putValidRdf(req, res, next))
    } else return next(new HTTPError(415, 'RDF file contains invalid syntax'))
  }
  return putStream(req, res, next)
}

// TODO could be renamed as putResource (it now covers container and non-container)
async function putStream (req, res, next, stream = req) {
  const ldp = req.app.locals.ldp
  try {
    debug('test ' + req.get('content-type') + getContentType(req.headers))
    await ldp.put(req, stream, getContentType(req.headers))
    debug('succeded putting the file/folder')
    res.sendStatus(201)
    return next()
  } catch (err) {
    debug('error putting the file/folder:' + err.message)
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
