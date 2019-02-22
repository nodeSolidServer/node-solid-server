// Express handler for LDP PATCH requests

module.exports = handler

const bodyParser = require('body-parser')
const fs = require('fs')
const debug = require('../debug').handlers
const error = require('../http-error')
const $rdf = require('rdflib')
const crypto = require('crypto')
const overQuota = require('../utils').overQuota
const getContentType = require('../utils').getContentType

// Patch parsers by request body content type
const PATCH_PARSERS = {
  'application/sparql-update': require('./patch/sparql-update-parser.js'),
  'text/n3': require('./patch/n3-patch-parser.js')
}

const DEFAULT_FOR_NEW_CONTENT_TYPE = 'text/turtle'

// Handles a PATCH request
async function patchHandler (req, res, next) {
  debug('@@ Patch ' + req.originalUrl)
  debug(`PATCH -- ${req.originalUrl}`)
  res.header('MS-Author-Via', 'SPARQL')
  try {
    // Obtain details of the target resource
    const ldp = req.app.locals.ldp
    const serverUri = ldp.serverUri // @@ ??? timbl
    debug('@@ serverUri' + serverUri)
    const graph = $rdf.graph()
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

    const patchObject = await parsePatch(url, patch.uri, patch.text)
    try {
      checkPermission(req, patchObject)
    } catch (err) {
      return res.status(403).send('Unauthorized patch')
    }

    const root = ldp.resourceMapper.getBasePath(req.hostname)

    const isOverQuota = await overQuota(root, serverUri)
    if (isOverQuota) {
      return res.status(413).send('Patch: User storage quote exceeded')
    }
    // ###########################################################
    /* THIS SECTION MUST NOT GIVE UP CONTROL
    */
    // Patch the graph and write it back to the file
    debug('Patch: Sync block starts ####################')
    var fileContents

    try {
      fileContents = fs.readFileSync(resource.path, { encoding: 'utf8' })
    } catch (err) {
      if (err.code === 'ENOENT') { // Solid you CAN patch an non-existent file into existence
        fileContents = ''
        debug('Patch: Patching non-existent file into existence')
        // Fail on all other errors
      } else {
        debug('Patch: Target file read error! ' + err)
        return res.status(500).send('Patch: Original file read error ' + err)
      }
    }
    debug('PATCH -- Read target file OK (%d bytes)', fileContents.length)

    graph.applyPatch(patchObject, graph.sym(resource.url), (err) => {
      if (err) {
        const message = err.message || err // returns string at the moment
        debug(`PATCH -- FAILED. Returning 409. Message: '${message}'`)
        return res.status(409).send('Conflict: Patch application failed for some reason')
      }
      const resourceSym = graph.sym(resource.url)
      const serialized = $rdf.serialize(resourceSym, graph, resource.url, resource.contentType)
      debug('PATCH: Serialized bytes ' + serialized.length)
      try {
        fs.writeFileSync(resource.path, serialized, { encoding: 'utf8' })
      } catch (err) {
        debug('PATCH Sync block end in error:' + err)
        return res.status(500).send(`Failed to write file after patch: ${err}`)
      }
      debug('PATCH -- applied successfully   ##############')
      res.status(200).send('Patch applied successfully') // String tested in test
    })
    // ########################################################### SYNC BLOCK END

    // Send the result to the client
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

// Creates a hash of the given text
function hash (text) {
  return crypto.createHash('md5').update(text).digest('hex')
}
