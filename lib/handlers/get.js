module.exports = handler

const fs = require('fs')
const glob = require('glob')
const _path = require('path')
const $rdf = require('rdflib')
const Negotiator = require('negotiator')
const url = require('url')
const mime = require('mime-types')

const debug = require('debug')('solid:get')
const debugGlob = require('debug')('solid:glob')
const allow = require('./allow')

const utils = require('../utils.js')
const translate = require('../utils.js').translate
const error = require('../http-error')

const RDFs = require('../ldp').RDF_MIME_TYPES

function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  const includeBody = req.method === 'GET'
  const negotiator = new Negotiator(req)
  const baseUri = utils.getFullUri(req)
  const path = res.locals.path || req.path
  const requestedType = negotiator.mediaType()
  let possibleRDFType = negotiator.mediaType(RDFs)
  // Fallback to text/turtle if content type is unknown
  possibleRDFType = (!possibleRDFType) ? 'text/turtle' : possibleRDFType

  res.header('MS-Author-Via', 'SPARQL')

  // Set live updates
  if (ldp.live) {
    res.header('Updates-Via', utils.getBaseUri(req).replace(/^http/, 'ws'))
  }

  debug(req.originalUrl + ' on ' + req.hostname)

  const options = {
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

    let stream
    let contentType
    let container
    let contentRange
    let chunksize

    if (ret) {
      stream = ret.stream
      contentType = ret.contentType
      container = ret.container
      contentRange = ret.contentRange
      chunksize = ret.chunksize
    }

    // Till here it must exist
    if (!includeBody) {
      debug('HEAD only')
      contentType = mime.contentType(_path.extname(path))
      res.setHeader('Content-Type', contentType)
      res.status(200).send('OK')
      return next()
    }

    // Handle dataBrowser
    if (requestedType && requestedType.includes('text/html')) {
      let mimeTypeByExt = mime.lookup(_path.basename(path))
      let isHtmlResource = mimeTypeByExt && mimeTypeByExt.includes('html')
      let useDataBrowser = ldp.dataBrowserPath && (
        container ||
        RDFs.includes(contentType) && !isHtmlResource && !ldp.suppressDataBrowser)

      if (useDataBrowser) {
        res.set('Content-Type', 'text/html')
        const defaultDataBrowser = _path.join(__dirname, '../../static/databrowser.html')
        const dataBrowserPath = ldp.dataBrowserPath === 'default' ? defaultDataBrowser : ldp.dataBrowserPath
        debug('   sending data browser file: ' + dataBrowserPath)
        res.sendFile(dataBrowserPath)
        return
      } else if (stream) {
        res.setHeader('Content-Type', contentType)
        return stream.pipe(res)
      }
    }

    // If request accepts the content-type we found
    if (stream && negotiator.mediaType([contentType])) {
      res.setHeader('Content-Type', contentType)
      if (contentRange) {
        const headers = { 'Content-Range': contentRange, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize }
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
  const ldp = req.app.locals.ldp
  const root = !ldp.multiuser ? ldp.root : ldp.root + req.hostname + '/'
  const filename = utils.uriToFilename(req.path, root)
  const uri = utils.getFullUri(req)
  const requestUri = url.resolve(uri, req.path)

  const globOptions = {
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
    const globGraph = $rdf.graph()

    let reqOrigin = utils.getBaseUri(req)

    debugGlob('found matches ' + matches)
    Promise.all(matches.map(match => new Promise((resolve, reject) => {
      const baseUri = reqOrigin + '/' + match.substr(root.length)
      fs.readFile(match, { encoding: 'utf8' }, function (err, fileData) {
        if (err) {
          debugGlob('error ' + err)
          return resolve()
        }
        // Files should have the .ttl extension or be extensionless (also Turtle)
        if (!/\.ttl$|\/[^.]+$/.test(match)) {
          return resolve()
        }
        // The agent should have Read access to the file
        hasReadPermissions(match, req, res, function (allowed) {
          if (allowed) {
            try {
              $rdf.parse(fileData, globGraph, baseUri, 'text/turtle')
            } catch (parseErr) {
              debugGlob(`error parsing ${match}: ${parseErr}`)
            }
          }
          return resolve()
        })
      })
    })))
      .then(() => {
        const data = $rdf.serialize(undefined, globGraph, requestUri, 'text/turtle')
        // TODO this should be added as a middleware in the routes
        res.setHeader('Content-Type', 'text/turtle')
        debugGlob('returning turtle')

        res.send(data)
        return next()
      })
  })
}

// TODO: get rid of this ugly hack that uses the Allow handler to check read permissions
function hasReadPermissions (file, req, res, callback) {
  const ldp = req.app.locals.ldp

  if (!ldp.webid) {
    return callback(true)
  }

  const root = ldp.multiuser ? ldp.root + req.hostname + '/' : ldp.root
  const relativePath = '/' + _path.relative(root, file)
  res.locals.path = relativePath
  allow('Read')(req, res, err => callback(!err))
}
