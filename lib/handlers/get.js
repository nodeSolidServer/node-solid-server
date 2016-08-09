module.exports = handler

var fs = require('fs')
var glob = require('glob')
var _path = require('path')
var $rdf = require('rdflib')
var S = require('string')
var async = require('async')
var Negotiator = require('negotiator')

var debug = require('debug')('solid:get')
var debugGlob = require('debug')('solid:glob')
var acl = require('./allow')

var utils = require('../utils.js')
var translate = require('../utils.js').translate
var error = require('../http-error')

var RDFs = [
  'text/turtle',
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'text/n3',
  'application/rdf+xml',
  'application/ld+json',
  'application/x-turtle'
]

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var includeBody = req.method === 'GET'
  var negotiator = new Negotiator(req)
  var baseUri = utils.uriBase(req)
  var path = res.locals.path || req.path
  var requestedType = negotiator.mediaType()
  var possibleRDFType = negotiator.mediaType(RDFs)
  // Fallback to text/turtle if content type is unknown
  possibleRDFType = (!possibleRDFType) ? 'text/turtle' : possibleRDFType

  res.header('MS-Author-Via', 'SPARQL')

  // Set live updates
  if (ldp.live) {
    res.header('Updates-Via', req.protocol.replace(/^http/, 'ws') + '://' + req.get('host'))
  }

  debug(req.originalUrl + ' on ' + req.hostname)

  ldp.get(req.hostname, path, baseUri, includeBody, possibleRDFType, function (err, stream, contentType, container) {
    // use globHandler if magic is detected
    if (err && err.status === 404 && glob.hasMagic(path)) {
      debug('forwarding to glob request')
      return globHandler(req, res, next)
    }

    // Handle error
    if (err) {
      debug(req.method + ' -- Error: ' + err.status + ' ' + err.message)
      return next(err)
    }

    // Till here it must exist
    if (!includeBody) {
      debug('HEAD only')
      res.sendStatus(200)
      return next()
    }

    // Handle fileBrowser and dataBrowser
    if (requestedType.indexOf('text/html') === 0) {
      if (container && ldp.fileBrowser) {
        var address = req.protocol + '/' + req.get('host') + req.originalUrl
        return res.redirect(303, ldp.fileBrowser + address)
      }

      if (RDFs.indexOf(contentType) >= 0 && ldp.dataBrowser) {
        res.set('Content-Type', 'text/html')
        var dataBrowser = _path.join(__dirname, '../../static/databrowser.html')
        res.sendFile(dataBrowser)
        return
      } else {
        res.setHeader('Content-Type', contentType)
        return stream.pipe(res)
      }
    }

    // If request accepts the content-type we found
    if (negotiator.mediaType([contentType])) {
      debug('no translation ' + contentType)
      res.setHeader('Content-Type', contentType)
      return stream.pipe(res)
    }

    // If it is not in our RDFs we can't even translate,
    // Sorry, we can't help
    if (!possibleRDFType) {
      return next(error(406, 'Cannot serve requested type: ' + contentType))
    }

    // Translate from the contentType found to the possibleRDFType desired
    translate(stream, baseUri, contentType, possibleRDFType, function (err, data) {
      if (err) {
        debug('error translating: ' + req.originalUrl + ' ' + contentType + ' -> ' + possibleRDFType + ' -- ' + 500 + ' ' + err.message)
        return next(error(500, 'Error translating between RDF formats'))
      }
      debug(req.originalUrl + ' translating ' + contentType + ' -> ' + possibleRDFType)
      res.setHeader('Content-Type', possibleRDFType)
      res.send(data)
      return next()
    })
  })
}

function globHandler (req, res, next) {
  var ldp = req.app.locals.ldp
  var root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  var filename = utils.uriToFilename(req.path, root)
  var uri = utils.uriBase(req)

  var globOptions = {
    noext: true,
    nobrace: true,
    nodir: true
  }

  glob(filename, globOptions, function (err, matches) {
    if (err || matches.length === 0) {
      debugGlob('No files matching the pattern')
      return next(error(404, 'No files matching glob pattern'))
    }

    // Matches found
    var globGraph = $rdf.graph()

    debugGlob('found matches ' + matches)
    async.each(matches, function (match, done) {
      var baseUri = utils.filenameToBaseUri(match, uri, root)
      fs.readFile(match, {encoding: 'utf8'}, function (err, fileData) {
        if (err) {
          debugGlob('error ' + err)
          return done(null)
        }
        aclAllow(match, req, res, function (allowed) {
          if (!S(match).endsWith('.ttl') || !allowed) {
            return done(null)
          }
          try {
            $rdf.parse(
              fileData,
              globGraph,
              baseUri,
              'text/turtle')
          } catch (parseErr) {
            debugGlob('error in parsing the files' + parseErr)
          }
          return done(null)
        })
      })
    }, function () {
      var data = $rdf.serialize(
        undefined,
        globGraph,
        null,
        'text/turtle')
      // TODO this should be added as a middleware in the routes
      res.setHeader('Content-Type', 'text/turtle')
      debugGlob('returning turtle')

      res.send(data)
      return next()
    })
  })
}

function aclAllow (match, req, res, callback) {
  var ldp = req.app.locals.ldp

  if (!ldp.webid) {
    return callback(true)
  }

  var root = ldp.idp ? ldp.root + req.hostname + '/' : ldp.root
  var relativePath = '/' + _path.relative(root, match)
  res.locals.path = relativePath
  acl.allow('Read', req, res, function (err) {
    callback(err)
  })
}
