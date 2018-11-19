module.exports.addLink = addLink
module.exports.addLinks = addLinks
module.exports.parseMetadataFromHeader = parseMetadataFromHeader
module.exports.linksHandler = linksHandler
module.exports.addPermissions = addPermissions

const li = require('li')
const path = require('path')
const metadata = require('./metadata.js')
const debug = require('./debug.js')
const utils = require('./utils.js')
const error = require('./http-error')

const MODES = ['Read', 'Write', 'Append', 'Control']
const PERMISSIONS = MODES.map(m => m.toLowerCase())

function addLink (res, value, rel) {
  const oldLink = res.get('Link')
  if (oldLink === undefined) {
    res.set('Link', '<' + value + '>; rel="' + rel + '"')
  } else {
    res.set('Link', oldLink + ', ' + '<' + value + '>; rel="' + rel + '"')
  }
}

function addLinks (res, fileMetadata) {
  if (fileMetadata.isResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#Resource', 'type')
  }
  if (fileMetadata.isSourceResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#RDFSource', 'type')
  }
  if (fileMetadata.isContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#Container', 'type')
  }
  if (fileMetadata.isBasicContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#BasicContainer', 'type')
  }
  if (fileMetadata.isDirectContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#DirectContainer', 'type')
  }
}

async function linksHandler (req, res, next) {
  const ldp = req.app.locals.ldp
  const { path: filename } = await ldp.resourceMapper.mapUrlToFile(req)

  if (path.extname(filename) === ldp.suffixMeta) {
    debug.metadata('Trying to access metadata file as regular file.')

    return next(error(404, 'Trying to access metadata file as regular file'))
  }
  let fileMetadata = new metadata.Metadata()
  if (filename.endsWith('/')) {
    fileMetadata.isContainer = true
    fileMetadata.isBasicContainer = true
  } else {
    fileMetadata.isResource = true
  }
  // Add LDP-required Accept-Post header for OPTIONS request to containers
  if (fileMetadata.isContainer && req.method === 'OPTIONS') {
    res.header('Accept-Post', '*/*')
  }
  // Add ACL and Meta Link in header
  addLink(res, utils.pathBasename(req.path) + ldp.suffixAcl, 'acl')
  addLink(res, utils.pathBasename(req.path) + ldp.suffixMeta, 'describedBy')
  // Add other Link headers
  addLinks(res, fileMetadata)
  next()
}

function parseMetadataFromHeader (linkHeader) {
  let fileMetadata = new metadata.Metadata()
  if (linkHeader === undefined) {
    return fileMetadata
  }
  const links = linkHeader.split(',')
  for (let linkIndex in links) {
    const link = links[linkIndex]
    const parsedLinks = li.parse(link)
    for (let rel in parsedLinks) {
      if (rel === 'type') {
        if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Resource') {
          fileMetadata.isResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#RDFSource') {
          fileMetadata.isSourceResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Container') {
          fileMetadata.isContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#BasicContainer') {
          fileMetadata.isBasicContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#DirectContainer') {
          fileMetadata.isDirectContainer = true
        }
      }
    }
  }
  return fileMetadata
}

// Adds a header that describes the user's permissions
function addPermissions (req, res, next) {
  const { acl, session } = req
  if (!acl) return next()

  // Turn permissions for the public and the user into a header
  const resource = req.app.locals.ldp.resourceMapper.getBaseUrl(req.hostname, req.path)
  Promise.all([
    getPermissionsFor(acl, null, resource),
    getPermissionsFor(acl, session.userId, resource)
  ])
  .then(([publicPerms, userPerms]) => {
    debug.ACL(`Permissions on ${resource} for ${session.userId || '(none)'}: ${userPerms}`)
    debug.ACL(`Permissions on ${resource} for public: ${publicPerms}`)
    res.set('WAC-Allow', `user="${userPerms}",public="${publicPerms}"`)
  })
  .then(next, next)
}

// Gets the permissions string for the given user and resource
function getPermissionsFor (acl, user, resource) {
  return Promise.all(MODES.map(mode => acl.can(user, mode).catch(e => false)))
  .then(allowed => PERMISSIONS.filter((_, i) => allowed[i]).join(' '))
}
