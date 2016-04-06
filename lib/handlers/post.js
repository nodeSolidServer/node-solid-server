module.exports = handler

var Busboy = require('busboy')
var debug = require('debug')('ldnode:post')
var path = require('path')
var header = require('../header')
var patch = require('./patch')
var error = require('../http-error')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var contentType = req.get('content-type')
  debug('content-type is ', contentType)
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
      debug('Path is not a container, 405!')
      return next(error(405, 'Requested resource is not a container'))
    }

    // Dispatch to the right handler
    if (req.is('multipart/form-data')) {
      multi(req, res, next)
    } else {
      one(req, res, next)
    }
  })

  function multi () {
    debug('receving multiple files')

    var busboy = new Busboy({ headers: req.headers })
    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
      debug('One file received via multipart: ' + filename)
      ldp.put(
        req.hostname,
        path.join(containerPath, filename),
        file,
        function (err) {
          if (err) {
            busboy.emit('error', err)
          }
        })
    })
    busboy.on('error', function (err) {
      debug('Error receiving the file: ' + err.message)
      next(error(500, 'Error receiving the file'))
    })

    // Handled by backpressure of streams!
    busboy.on('finish', function () {
      debug('Done storing files')
      res.sendStatus(200)
      next()
    })
    req.pipe(busboy)
  }

  function one () {
    debug('Receving one file')
    var linkHeader = header.parseMetadataFromHeader(req.get('Link'))
    var slug = req.get('Slug')
    if (slug) {
      slug = slug.replace('/')
    }
    ldp.post(
      req.hostname,
      containerPath,
      slug,
      req,
      linkHeader.isBasicContainer,
      function (err, resourcePath) {
        if (err) {
          return next(err)
        }
        debug('File stored in ' + resourcePath)
        header.addLinks(res, linkHeader)
        res.set('Location', resourcePath)
        res.sendStatus(201)
        next()
      })
  }
}

