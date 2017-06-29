module.exports = handler

var debug = require('debug')('solid:put')
const header = require('../header')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  debug(req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  const linkHeader = header.parseMetadataFromHeader(req.get('Link'))
  let resourcePath = req.path

  const isContainer = resourcePath.endsWith('/') ||
      linkHeader.isContainer || linkHeader.isBasicContainer

  // Normalize container path if necessary
  if (isContainer && !resourcePath.endsWith('/')) {
    resourcePath += '/'
  }

  ldp.put(req.hostname, resourcePath, req, function (err, status) {
    if (err) {
      debug('error putting the file:' + err.message)
      err.message = 'Can\'t write file: ' + err.message
      return next(err)
    }

    debug('succeeded putting the file')

    res.sendStatus(status)
    return next()
  })
}

