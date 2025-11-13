import bodyParser from 'body-parser'
import debugModule from 'debug'
const debug = debugModule('solid:put')
import { getContentType, stringToStream } from '../utils.mjs'
import HTTPError from '../http-error.mjs'

export default async function handler (req, res, next) {
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
    } else {
      return next(HTTPError(415, 'RDF file needs to be turtle'))
    }
  }

  return putResource(req, res, next)
}

function isAuxiliary (req) {
  return req.originalUrl.endsWith('.acl') || req.originalUrl.endsWith('.meta')
}

async function putValidRdf (req, res, next) {
  debug('Parsing RDF for ' + req.originalUrl)
  const ldp = req.app.locals.ldp
  const contentType = getContentType(req.headers) || 'text/turtle'

  try {
    await ldp.validRdf(req.body, req.originalUrl, contentType)
    req.body = stringToStream(req.body)
    return putResource(req, res, next)
  } catch (err) {
    debug(`Invalid RDF file: ${req.originalUrl} - ${err}`)
    return next(HTTPError(400, `Invalid RDF file: ${err}`))
  }
}

async function putResource (req, res, next) {
  const ldp = req.app.locals.ldp
  const contentType = getContentType(req.headers)
  debug('Request ' + req.originalUrl)
  debug('content-type is', contentType)

  // check whether a folder or resource with same name exists
  try {
    await ldp.checkItemName(req)
  } catch (e) {
    return next(e)
  }
  try {
    const stream = req
    const result = await putStream(ldp, req, res, stream, contentType)
    res.set('MS-Author-Via', 'SPARQL') // ??? really?
    if (result === 201) {
      debug('new file created')
      res.sendStatus(result)
    } else {
      debug('file updated')
      res.sendStatus(result)
    }
    next()
  } catch (e) {
    debug('putResource error:' + e.status + ' ' + e.message)
    next(e)
  }
}

function putStream (ldp, req, res, stream, contentType) {
  const uri = res.locals.target.url
  return new Promise((resolve, reject) => {
    ldp.put(req, res, uri, contentType, stream, (err, result) => {
      if (err) {
        debug('putResource error:' + err.status + ' ' + err.message)
        err.status = err.status || 500
        err.message = err.message || 'Unknown error'
        return reject(err)
      }
      resolve(result)
    })
  })
}