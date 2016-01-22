module.exports = handler

var Busboy = require('busboy')
var each = require('async').each
var debug = require('debug')('ldnode:post')
var header = require('../header')
var patch = require('./patch')
var error = require('../http-error')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var contentType = req.get('content-type')

  // Handle SPARQL(-update?) query
  if (contentType === 'application/sparql' ||
      contentType === 'application/sparql-update') {
    debug('switching to sparql query')
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
      debug('path is not a container, 405!')
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
    debug('receving multiple files')
    var busboy = new Busboy({ headers: req.headers })
    var files = []

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
      debug('one file received via multipart: ' + filename)
      files.push({stream: file, name: filename})
    })
    busboy.on('finish', function () {
      each(
        files,
        function (file, callback) {
          ldp.post(
            req.hostname,
            containerPath,
            file.filename,
            file.stream,
            false,
            callback)
        }, function (err) {
          debug('done storing files' + (err ? 'with error' + err.message : 'with no error'))
          res.sendStatus(err ? 500 : 200)
          next()
        })
    })
  }

  function one () {
    debug('receving one file')
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
        next()
      })
  }
}

