module.exports = handler

var bodyParser = require('body-parser')
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

const readEntity = bodyParser.text({ type: '*/*' })

function handler (req, res, next) {
  readEntity(req, res, () => patchHandler(req, res, next))
}

function patchHandler (req, res, next) {
  const patchText = req.body ? req.body.toString() : ''
  debug('PATCH -- ' + req.originalUrl)
  debug('PATCH -- Received patch (%d bytes)', patchText.length)
  res.header('MS-Author-Via', 'SPARQL')

  var ldp = req.app.locals.ldp
  var root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  var targetFile = utils.uriToFilename(req.path, root)
  var targetContentType = mime.lookup(targetFile) || DEFAULT_CONTENT_TYPE
  var patchContentType = req.get('content-type')
    ? req.get('content-type').split(';')[0].trim() // Ignore parameters
    : ''
  var targetURI = utils.uriAbs(req) + req.originalUrl

  debug('PATCH -- Content-type ' + patchContentType + ' patching target ' + targetContentType + ' <' + targetURI + '>')

  // Obtain a patcher for the given patch type
  const patchGraph = PATCHERS[patchContentType]
  if (!patchGraph) {
    return next(error(415, 'Unknown patch content type: ' + patchContentType))
  }

  // Read the RDF graph to be patched from the file
  readGraph(targetFile, targetURI, targetContentType)
  // Patch the graph and write it back to the file
  .then(targetKB => patchGraph(targetKB, targetFile, targetURI, patchText))
  .then(targetKB => writeGraph(targetKB, targetFile, targetURI, targetContentType))
  // Send the result to the client
  .then(result => { res.send(result) })
  .then(next, next)
}

// Reads the RDF graph in the given file with the corresponding URI
function readGraph (resourceFile, resourceURI, contentType) {
  // Read the file
  return new Promise((resolve, reject) =>
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
  )
  // Parse the file
  .then((fileContents) => {
    const graph = $rdf.graph()
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

// Writes the RDF graph to the given file
function writeGraph (graph, resourceFile, resourceURI, contentType) {
  return new Promise((resolve, reject) => {
    const resource = graph.sym(resourceURI)
    const serialized = $rdf.serialize(resource, graph, resourceURI, contentType)

    fs.writeFile(resourceFile, serialized, {encoding: 'utf8'}, function (err) {
      if (err) {
        return reject(error(500, 'Failed to write file back after patch: ' + err))
      }
      debug('PATCH -- applied OK (sync)')
      resolve('Patch applied OK\n')
    })
  })
}
