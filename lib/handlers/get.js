module.exports = handler

var fs = require('fs')
var glob = require('glob')
var _path = require('path')
var $rdf = require('rdflib')
var S = require('string')
var Negotiator = require('negotiator')
const url = require('url')
const mime = require('mime-types')

var debug = require('debug')('solid:get')
var debugGlob = require('debug')('solid:glob')
var allow = require('./allow')

var utils = require('../utils.js')
var translate = require('../utils.js').translate
var error = require('../http-error')

const RDFs = require('../ldp').RDF_MIME_TYPES

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
  var includeBody = req.method === 'GET'
  var negotiator = new Negotiator(req)
  var baseUri = utils.getFullUri(req)
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

  var options = {
    'hostname': req.hostname,
    'path': path,
    'baseUri': baseUri,
    'includeBody': includeBody,
    'possibleRDFType': possibleRDFType,
    'range': req.headers.range
  }
  ldp.get(options, function (err, ret) {
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

    if (ret) {
      var stream = ret.stream
      var contentType = ret.contentType
      var container = ret.container
      var contentRange = ret.contentRange
      var chunksize = ret.chunksize
    }

    // Till here it must exist
    if (!includeBody) {
      debug('HEAD only')
      res.sendStatus(200)
      return next()
    }

    // Handle fileBrowser and dataBrowser
    if (requestedType && requestedType.includes('text/html')) {
      if (container && ldp.fileBrowser) {
        var address = req.protocol + '/' + req.get('host') + req.originalUrl
        return res.redirect(303, ldp.fileBrowser + address)
      }

      let mimeTypeByExt = mime.lookup(_path.basename(path))
      let isHtmlResource = mimeTypeByExt && mimeTypeByExt.includes('html')
      let useDataBrowser = RDFs.includes(contentType) &&
        !isHtmlResource &&  // filter out .html which IS an RDF type, but does not use data browser
        !ldp.suppressDataBrowser &&
        ldp.dataBrowserPath

      if (useDataBrowser) {
        res.set('Content-Type', 'text/html')
        var defaultDataBrowser = _path.join(__dirname, '../../static/databrowser.html')
        var dataBrowserPath = ldp.dataBrowserPath === 'default' ? defaultDataBrowser : ldp.dataBrowserPath
        debug('   sending data browser file: ' + dataBrowserPath)
        res.sendFile(dataBrowserPath)
        return
      } else {
        res.setHeader('Content-Type', contentType)
        return stream.pipe(res)
      }
    }

    // If request accepts the content-type we found
    if (negotiator.mediaType([contentType])) {
      debug('no translation necessary ' + contentType)
      res.setHeader('Content-Type', contentType)
      if (contentRange) {
        var headers = { 'Content-Range': contentRange, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize }
        res.writeHead(206, headers)
        return stream.pipe(res)
      } else {
        return stream.pipe(res)
      }
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
  var root = !ldp.multiuser ? ldp.root : ldp.root + req.hostname + '/'
  var filename = utils.uriToFilename(req.path, root)
  var uri = utils.getFullUri(req)
  const requestUri = url.resolve(uri, req.path)

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

    let reqOrigin = utils.getBaseUri(req)

    debugGlob('found matches ' + matches)
    Promise.all(matches.map(match => new Promise((resolve, reject) => {
      var baseUri = utils.filenameToBaseUri(match, reqOrigin, root)
      fs.readFile(match, {encoding: 'utf8'}, function (err, fileData) {
        if (err) {
          debugGlob('error ' + err)
          return resolve()
        }
        aclAllow(match, req, res, function (allowed) {
          if (!S(match).endsWith('.ttl') || !allowed) {
            return resolve()
          }
          try {
            $rdf.parse(fileData, globGraph, baseUri, 'text/turtle')
          } catch (parseErr) {
            debugGlob(`error parsing ${match}: ${parseErr}`)
          }
          return resolve()
        })
      })
    })))
    .then(() => {
      var data = $rdf.serialize(undefined, globGraph, requestUri, 'text/turtle')
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

  var root = ldp.multiuser ? ldp.root + req.hostname + '/' : ldp.root
  var relativePath = '/' + _path.relative(root, match)
  res.locals.path = relativePath
  allow('Read', req, res, function (err) {
    callback(err)
  })
}
