module.exports = handler

var mime = require('mime-types')
var fs = require('fs')
var debug = require('../debug').handlers
var utils = require('../utils.js')
var error = require('../http-error')
var $rdf = require('rdflib')

const DEFAULT_CONTENT_TYPE = 'text/turtle'

const PATCHERS = {
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

  // Obtain a patcher for the given patch type
  const patch = PATCHERS[patchContentType]
  if (!patch) {
    return next(error(415, 'Unknown patch content type: ' + patchContentType))
  }

  // Read the RDF graph to be patched
  readGraph(filename, targetURI).then((targetKB) => {
    // Patch the target graph
    patch(targetKB, filename, targetURI, req.text, function (err, result) {
      if (err) {
        throw err
      }
      res.send(result)
      next()
    })
  })
  .catch(next)
}

// Reads the RDF graph in the given file with the corresponding URI
function readGraph (resourceFile, resourceURI) {
  // Read the file
  return new Promise((resolve, reject) => {
    fs.readFile(resourceFile, {encoding: 'utf8'}, function (err, fileContents) {
      if (err) {
        // If the file does not exist, assume empty contents
        // (it will be created after a successful patch)
        if (err.code === 'ENOENT') {
          fileContents = ''
        // Fail on all other errors
        } else {
          return reject(error(500, 'Patch: Original file read error:' + err))
        }
      }
      debug('PATCH -- Read target file (%d bytes)', fileContents.length)
      resolve(fileContents)
    })
  })
  // Parse the file
  .then((fileContents) => {
    const graph = $rdf.graph()
    const contentType = mime.lookup(resourceFile) || DEFAULT_CONTENT_TYPE
    debug('PATCH -- Reading %s with content type %s', resourceURI, contentType)
    try {
      $rdf.parse(fileContents, graph, resourceURI, contentType)
    } catch (err) {
      throw error(500, 'Patch: Target ' + contentType + ' file syntax error:' + err)
    }
    debug('PATCH -- Parsed target file')
    return graph
  })
}
