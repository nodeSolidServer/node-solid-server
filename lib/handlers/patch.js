// Express handler for LDP PATCH requests

module.exports = handler

const bodyParser = require('body-parser')
const fs = require('fs')
const fx = require('mkdir-recursive')
const debug = require('../debug').handlers
const error = require('../http-error')
const $rdf = require('rdflib')
const crypto = require('crypto')
const overQuota = require('../utils').overQuota
const getContentType = require('../utils').getContentType
const withLock = require('../lock')

// Patch parsers by request body content type
const PATCH_PARSERS = {
  'application/sparql-update': require('./patch/sparql-update-parser.js'),
  'text/n3': require('./patch/n3-patch-parser.js')
}

const DEFAULT_FOR_NEW_CONTENT_TYPE = 'text/turtle'

// Handles a PATCH request
async function patchHandler (req, res, next) {
  debug(`PATCH -- ${req.originalUrl}`)
  res.header('MS-Author-Via', 'SPARQL')
  try {
    // Obtain details of the target resource
    const ldp = req.app.locals.ldp
    let path, contentType
    try {
      // First check if the file already exists
      ({ path, contentType } = await ldp.resourceMapper.mapUrlToFile({ url: req }))
    } catch (err) {
      // If the file doesn't exist, request one to be created with the default content type
      ({ path, contentType } = await ldp.resourceMapper.mapUrlToFile(
        { url: req, createIfNotExists: true, contentType: DEFAULT_FOR_NEW_CONTENT_TYPE }))
    }
    const { url } = await ldp.resourceMapper.mapFileToUrl({ path, hostname: req.hostname })
    const resource = { path, contentType, url }
    debug('PATCH -- Target <%s> (%s)', url, contentType)

    // Obtain details of the patch document
    const patch = {}
    patch.text = req.body ? req.body.toString() : ''
    patch.uri = `${url}#patch-${hash(patch.text)}`
    patch.contentType = getContentType(req.headers)
    debug('PATCH -- Received patch (%d bytes, %s)', patch.text.length, patch.contentType)
    const parsePatch = PATCH_PARSERS[patch.contentType]
    if (!parsePatch) {
      throw error(415, `Unsupported patch content type: ${patch.contentType}`)
    }

    // Parse the patch document and verify permissions
    const patchObject = await parsePatch(url, patch.uri, patch.text)
    await checkPermission(req, patchObject)

    // Check to see if folder exists
    const pathSplit = path.split('/')
    const directory = pathSplit.slice(0, pathSplit.length - 1).join('/')
    if (!fs.existsSync(directory)) {
      fx.mkdirSync(directory, { recursive: true })
    }

    // Patch the graph and write it back to the file
    const result = await withLock(path, { mustExist: false }, async () => {
      const graph = await readGraph(resource)
      await applyPatch(patchObject, graph, url)
      return writeGraph(graph, resource, ldp.resourceMapper.resolveFilePath(req.hostname), ldp.serverUri)
    })

    // Send the result to the client
    res.send(result)
  } catch (err) {
    return next(err)
  }
  return next()
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
    fs.readFile(resource.path, { encoding: 'utf8' }, function (err, fileContents) {
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
    debug('PATCH -- Reading %s with content type %s', resource.url, resource.contentType)
    try {
      $rdf.parse(fileContents, graph, resource.url, resource.contentType)
    } catch (err) {
      throw error(500, `Patch: Target ${resource.contentType} file syntax error: ${err}`)
    }
    debug('PATCH -- Parsed target file')
    return graph
  })
}

// Verifies whether the user is allowed to perform the patch on the target
async function checkPermission (request, patchObject) {
  // If no ACL object was passed down, assume permissions are okay.
  if (!request.acl) return Promise.resolve(patchObject)
  // At this point, we already assume append access,
  // as this can be checked upfront before parsing the patch.
  // Now that we know the details of the patch,
  // we might need to perform additional checks.
  let modes = []
  const { acl, session: { userId } } = request
  // Read access is required for DELETE and WHERE.
  // If we would allows users without read access,
  // they could use DELETE or WHERE to trigger 200 or 409,
  // and thereby guess the existence of certain triples.
  // DELETE additionally requires write access.
  if (patchObject.delete) {
    modes = ['Read', 'Write']
    // checks = [acl.can(userId, 'Read'), acl.can(userId, 'Write')]
  } else if (patchObject.where) {
    modes = ['Read']
    // checks = [acl.can(userId, 'Read')]
  }
  const allowed = await Promise.all(modes.map(mode => acl.can(userId, mode)))
  const allAllowed = allowed.reduce((memo, allowed) => memo && allowed, true)
  if (!allAllowed) {
    const errors = await Promise.all(modes.map(mode => acl.getError(userId, mode)))
    const error = errors.filter(error => !!error)
      .reduce((prevErr, err) => prevErr.status > err.status ? prevErr : err, { status: 0 })
    return Promise.reject(error)
  }
  return Promise.resolve(patchObject)
}

// Applies the patch to the RDF graph
function applyPatch (patchObject, graph, url) {
  debug('PATCH -- Applying patch')
  return new Promise((resolve, reject) =>
    graph.applyPatch(patchObject, graph.sym(url), (err) => {
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
function writeGraph (graph, resource, root, serverUri) {
  debug('PATCH -- Writing patched file')
  return new Promise((resolve, reject) => {
    const resourceSym = graph.sym(resource.url)
    const serialized = $rdf.serialize(resourceSym, graph, resource.url, resource.contentType)

    // First check if we are above quota
    overQuota(root, serverUri).then((isOverQuota) => {
      if (isOverQuota) {
        return reject(error(413,
          'User has exceeded their storage quota'))
      }

      fs.writeFile(resource.path, serialized, { encoding: 'utf8' }, function (err) {
        if (err) {
          return reject(error(500, `Failed to write file after patch: ${err}`))
        }
        debug('PATCH -- applied successfully')
        resolve('Patch applied successfully.\n')
      })
    }).catch(() => reject(error(500, 'Error finding user quota')))
  })
}

// Creates a hash of the given text
function hash (text) {
  return crypto.createHash('md5').update(text).digest('hex')
}
