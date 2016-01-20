module.exports = handler

var Busboy = require('busboy')

var debug = require('../debug').handlers
var header = require('../header')
var patch = require('./patch')
var error = require('../http-error')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var contentType = req.get('content-type')

  // Handle SPARQL(-update?) query
  if (contentType === 'application/sparql' ||
      contentType === 'application/sparql-update') {
    debug('POST -- Handling sparql query via PATCH')
    return patch(req, res, next)
  }

  // Handle container path
  var containerPath = req.path
  if (containerPath[containerPath.length - 1] !== '/') {
    containerPath += '/'
  }

  // Check if container exists
  ldp.exists(req.hostname, containerPath, function (err, stats) {
    if (err) {
      return next(error(err, 'Container not valid'))
    }

    // Check if container is a directory
    if (!stats.isDirectory()) {
      debug('POST -- Path is not a container')
      return next(error(405, 'Requested resource is not a container'))
    }

    // Dispatch to the right handler
    if (contentType === 'multipart/form-data') {
      multi(req, res, next)
    } else {
      one(req, res, next)
    }
  })

  function multi () {
    var busboy = new Busboy({ headers: req.headers })

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
      ldp.post(
        req.hostname,
        containerPath,
        filename,
        file,
        false,
        function (err) {
          if (err) {
            return busboy.emit(err)
          }
        })
    })
    busboy.on('error', function (err) {
      next(err)
    })
    busboy.on('finish', function () {
      res.sendStatus(200)
    })
  }

  function one () {
    var linkHeader = header.parseMetadataFromHeader(req.get('Link'))

    ldp.post(
      req.hostname,
      containerPath,
      req.get('Slug'),
      req,
      linkHeader.isBasicContainer,
      function (err, resourcePath) {
        if (err) {
          next(err)
        }
        header.addLinks(res, linkHeader)
        res.set('Location', resourcePath)
        res.sendStatus(201)
      })
  }
}
