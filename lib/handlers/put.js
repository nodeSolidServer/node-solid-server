module.exports = handler

const bodyParser = require('body-parser')
const debug = require('debug')('solid:put')
const getContentType = require('../utils').getContentType

async function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  debug(req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  try {
    await ldp.put(req, req, getContentType(req.headers))
    debug('succeded putting the file')

    res.sendStatus(201)
    return next()
  } catch (err) {
    debug('error putting the file:' + err.message)
    err.message = 'Can\'t write file: ' + err.message
    return next(err)
  }
}

// function handler (req, res, next) {
//   const ldp = req.app.locals.ldp
//   debug(req.originalUrl)
//   res.header('MS-Author-Via', 'SPARQL')
// 
//   const contentType = req.get('content-type')
//   if (ldp.mimetypeIsRdf(contentType)) {
//     return bodyParser.text({ type: () => true })(req, res, () => putText(req, res, next))
//   }
//   return putStream(req, res, next)
// }
// 
// function putText (req, res, next) {
//   const ldp = req.app.locals.ldp
//   const contentType = req.get('content-type')
//   const requestUri = `${req.protocol}//${req.get('host')}${req.originalUrl}`
//   if (ldp.isValidRdf(req.body, requestUri, contentType)) {
//     return ldp.putText(req.hostname, req.path, req.body, handleCallback(res, next))
//   }
//   next(error(400, 'RDF file contains invalid syntax'))
// }
// 
// function putStream (req, res, next) {
//   const ldp = req.app.locals.ldp
//   ldp.putStream(req.hostname, req.path, req, handleCallback(res, next))
// }
// 
// function handleCallback (res, next) {
//   return function (err) {
//     if (err) {
//       debug('error putting the file:' + err.message)
//       err.message = 'Can\'t write file: ' + err.message
//       return next(err)
//     }
// 
//     debug('succeded putting the file')
// 
//     res.sendStatus(201)
//     return next()
//   }
// }
