module.exports = handler

var mime = require('mime-types')
var debug = require('../debug').handlers
var utils = require('../utils.js')
var error = require('../http-error')

const DEFAULT_CONTENT_TYPE = 'text/turtle'

const PATCHERS = {
  'application/sparql': require('./patch/sparql-patcher.js'),
  'application/sparql-update': require('./patch/sparql-update-patcher.js')
}

function handler (req, res, next) {
  req.setEncoding('utf8')
  req.text = ''
  req.on('data', function (chunk) {
    req.text += chunk
  })

  req.on('end', function () {
    patchHandler(req, res, next)
  })
}

function patchHandler (req, res, next) {
  var ldp = req.app.locals.ldp
  debug('PATCH -- ' + req.originalUrl)
  debug('PATCH -- text length: ' + (req.text ? req.text.length : 'undefined2'))
  res.header('MS-Author-Via', 'SPARQL')

  var root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  var filename = utils.uriToFilename(req.path, root)
  var targetContentType = mime.lookup(filename) || DEFAULT_CONTENT_TYPE
  var patchContentType = req.get('content-type')
    ? req.get('content-type').split(';')[0].trim() // Ignore parameters
    : ''
  var targetURI = utils.uriAbs(req) + req.originalUrl

  debug('PATCH -- Content-type ' + patchContentType + ' patching target ' + targetContentType + ' <' + targetURI + '>')

  const patch = PATCHERS[patchContentType]
  if (!patch) {
    return next(error(400, 'Unknown patch content type: ' + patchContentType))
  }
  patch(filename, targetURI, req.text, function (err, result) {
    if (err) {
      next(err)
    } else {
      res.send(result)
      next()
    }
  })
}
