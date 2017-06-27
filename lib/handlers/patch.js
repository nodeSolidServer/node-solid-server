// Express handler for LDP PATCH requests

module.exports = handler

const bodyParser = require('body-parser')
const mime = require('mime-types')
const fs = require('fs')
const debug = require('../debug').handlers
const utils = require('../utils.js')
const error = require('../http-error')
const $rdf = require('rdflib')
const crypto = require('crypto')

const DEFAULT_TARGET_TYPE = 'text/turtle'

// Patch handlers by request body content type
const PATCHERS = {
  'application/sparql-update': require('./patch/sparql-update-patcher.js'),
  'text/n3': require('./patch/n3-patcher.js')
}

// Handles a PATCH request
function patchHandler (req, res, next) {
  debug('PATCH -- ' + req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  // Obtain details of the target resource
  const ldp = req.app.locals.ldp
  const root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  const target = {}
  target.file = utils.uriToFilename(req.path, root)
  target.uri = utils.uriAbs(req) + req.originalUrl
  target.contentType = mime.lookup(target.file) || DEFAULT_TARGET_TYPE
  debug('PATCH -- Target <%s> (%s)', target.uri, target.contentType)

  // Obtain details of the patch document
  const patch = {}
  patch.text = req.body ? req.body.toString() : ''
  patch.uri = `${target.uri}#patch-${hash(patch.text)}`
  patch.contentType = (req.get('content-type') || '').match(/^[^;\s]*/)[0]
  debug('PATCH -- Received patch (%d bytes, %s)', patch.text.length, patch.contentType)

  // Find the appropriate patcher for the given content type
  const patchGraph = PATCHERS[patch.contentType]
  if (!patchGraph) {
    return next(error(415, 'Unknown patch content type: ' + patch.contentType))
  }

  // Read the RDF graph to be patched from the file
  readGraph(target)
  // Patch the graph and write it back to the file
  .then(graph => patchGraph(graph, target.uri, patch.uri, patch.text))
  .then(graph => writeGraph(graph, target))
  // Send the result to the client
  .then(result => { res.send(result) })
  .then(next, next)
}

// Reads the request body and calls the actual patch handler
function handler (req, res, next) {
  readEntity(req, res, () => patchHandler(req, res, next))
}
const readEntity = bodyParser.text({ type: () => true })

// Reads the RDF graph in the given resource
function readGraph (resource) {
  // Read the resource's file
  return new Promise((resolve, reject) =>
    fs.readFile(resource.file, {encoding: 'utf8'}, function (err, fileContents) {
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
  // Parse the resource's file contents
  .then((fileContents) => {
    const graph = $rdf.graph()
    debug('PATCH -- Reading %s with content type %s', resource.uri, resource.contentType)
    try {
      $rdf.parse(fileContents, graph, resource.uri, resource.contentType)
    } catch (err) {
      throw error(500, 'Patch: Target ' + resource.contentType + ' file syntax error:' + err)
    }
    debug('PATCH -- Parsed target file')
    return graph
  })
}

// Writes the RDF graph to the given resource
function writeGraph (graph, resource) {
  return new Promise((resolve, reject) => {
    const resourceSym = graph.sym(resource.uri)
    const serialized = $rdf.serialize(resourceSym, graph, resource.uri, resource.contentType)

    fs.writeFile(resource.file, serialized, {encoding: 'utf8'}, function (err) {
      if (err) {
        return reject(error(500, 'Failed to write file back after patch: ' + err))
      }
      debug('PATCH -- applied OK (sync)')
      resolve('Patch applied OK\n')
    })
  })
}

// Creates a hash of the given text
function hash (text) {
  return crypto.createHash('md5').update(text).digest('hex')
}
