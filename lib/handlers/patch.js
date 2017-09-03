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

// Patch parsers by request body content type
const PATCH_PARSERS = {
  'application/sparql-update': require('./patch/sparql-update-parser.js'),
  'text/n3': require('./patch/n3-patch-parser.js')
}

// Handles a PATCH request
function patchHandler (req, res, next) {
  debug(`PATCH -- ${req.originalUrl}`)
  res.header('MS-Author-Via', 'SPARQL')

  // Obtain details of the target resource
  const ldp = req.app.locals.ldp
  const root = !ldp.multiuser ? ldp.root : `${ldp.root}${req.hostname}/`
  const target = {}
  target.file = utils.uriToFilename(req.path, root)
  target.uri = utils.getBaseUri(req) + req.originalUrl
  target.contentType = mime.lookup(target.file) || DEFAULT_TARGET_TYPE
  debug('PATCH -- Target <%s> (%s)', target.uri, target.contentType)

  // Obtain details of the patch document
  const patch = {}
  patch.text = req.body ? req.body.toString() : ''
  patch.uri = `${target.uri}#patch-${hash(patch.text)}`
  patch.contentType = (req.get('content-type') || '').match(/^[^;\s]*/)[0]
  debug('PATCH -- Received patch (%d bytes, %s)', patch.text.length, patch.contentType)
  const parsePatch = PATCH_PARSERS[patch.contentType]
  if (!parsePatch) {
    return next(error(415, `Unsupported patch content type: ${patch.contentType}`))
  }

  // Parse the target graph and the patch document,
  // and verify permission for performing this specific patch
  Promise.all([
    readGraph(target),
    parsePatch(target.uri, patch.uri, patch.text)
      .then(patchObject => checkPermission(target, req, patchObject))
  ])
  // Patch the graph and write it back to the file
  .then(([graph, patchObject]) => applyPatch(patchObject, graph, target))
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
          return reject(error(500, `Original file read error: ${err}`))
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
      throw error(500, `Patch: Target ${resource.contentType} file syntax error: ${err}`)
    }
    debug('PATCH -- Parsed target file')
    return graph
  })
}

// Verifies whether the user is allowed to perform the patch on the target
function checkPermission (target, request, patchObject) {
  // If no ACL object was passed down, assume permissions are okay.
  if (!request.acl) return Promise.resolve(patchObject)
  // At this point, we already assume append access,
  // as this can be checked upfront before parsing the patch.
  // Now that we know the details of the patch,
  // we might need to perform additional checks.
  let checks = []
  const { acl, session: { userId } } = request
  // Read access is required for DELETE and WHERE.
  // If we would allows users without read access,
  // they could use DELETE or WHERE to trigger 200 or 409,
  // and thereby guess the existence of certain triples.
  // DELETE additionally requires write access.
  if (patchObject.delete) {
    checks = [acl.can(userId, 'Read'), acl.can(userId, 'Write')]
  } else if (patchObject.where) {
    checks = [acl.can(userId, 'Read')]
  }
  return Promise.all(checks).then(() => patchObject)
}

// Applies the patch to the RDF graph
function applyPatch (patchObject, graph, target) {
  debug('PATCH -- Applying patch')
  return new Promise((resolve, reject) =>
    graph.applyPatch(patchObject, graph.sym(target.uri), (err) => {
      if (err) {
        const message = err.message || err // returns string at the moment
        debug(`PATCH -- FAILED. Returning 409. Message: '${message}'`)
        return reject(error(409, `The patch could not be applied. ${message}`))
      }
      resolve(graph)
    })
  )
}

// Writes the RDF graph to the given resource
function writeGraph (graph, resource) {
  debug('PATCH -- Writing patched file')
  return new Promise((resolve, reject) => {
    const resourceSym = graph.sym(resource.uri)
    const serialized = $rdf.serialize(resourceSym, graph, resource.uri, resource.contentType)

    fs.writeFile(resource.file, serialized, {encoding: 'utf8'}, function (err) {
      if (err) {
        return reject(error(500, `Failed to write file after patch: ${err}`))
      }
      debug('PATCH -- applied successfully')
      resolve('Patch applied successfully.\n')
    })
  })
}

// Creates a hash of the given text
function hash (text) {
  return crypto.createHash('md5').update(text).digest('hex')
}
