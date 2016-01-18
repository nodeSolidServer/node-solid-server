module.exports = handler

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

  var containerPath = req.path
  debug('POST -- On parent: ' + containerPath)

  // Not a container
  if (containerPath[containerPath.length - 1] !== '/') {
    containerPath += '/'
  }

  debug('POST -- Content Type: ' + contentType)

  var linkHeader = header.parseMetadataFromHeader(req.get('Link'))

  ldp.exists(req.hostname, containerPath, function (err, stats) {
    if (err) {
      return next(error(err, 'Container not valid'))
    }

    if (!stats.isDirectory()) {
      debug('POST -- Path is not a container')
      res.set('Allow', 'GET,HEAD,PUT,DELETE')
      return next(error(405, 'Requested resource is not a container'))
    }

    // TODO: possibly package this in ldp.post
    ldp.getAvailablePath(req.hostname, containerPath, req.get('Slug'), function (resourcePath) {
      debug('POST -- Will create at: ' + resourcePath)
      var meta = ''
      if (linkHeader.isBasicContainer) {
        resourcePath += '/'
        meta = ldp.suffixMeta
      }

      ldp.put(req.hostname, resourcePath + meta, req.text, function (err) {
        if (err) {
          return next(err)
        }

        header.addLinks(res, linkHeader)
        res.set('Location', resourcePath)
        res.sendStatus(201)
        return next()
      })
    })
  })
}
