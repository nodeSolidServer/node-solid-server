'use strict'

const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')
const LegacyResourceMapper = require('../legacy-resource-mapper')

const DEFAULT_ACL_SUFFIX = '.acl'

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.host = options.host
    this.origin = options.origin
    this.fetch = options.fetch
    this.fetchGraph = options.fetchGraph
    this.strictOrigin = options.strictOrigin
    this.trustedOrigins = options.trustedOrigins
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or rejects with an HTTP error otherwise
  async function can (user, mode) {
    var path = mapper.mapUrlToFile(this.resource)
    var filename = path
    const isContainer = path.endsWith('/')
    
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
    } else {
      filename = makeAclFilename(path)
    }

    if (! isContainer) {
      if (stat(filename)) {
	// Read the file, reject any errors with 500
	const denied = accessDenied('called with parameters for a file')
	if (denied) {
	  reject(denied) // With various parameters
	}
	return true
      }

      // So, the file didn't have its own ACL or wasn't an ACL file itself, so we prepare for looking up the hierarchy
      path = trimPath(path)
      filename = makeAclFilename(path)
    }

    while (! stat(filename)) {
      path = trimPath(path)
      if (path === root) {
	reject('Server has been misconfigured: No root ACL') // various other parameters
      }
      filename = makeAclFilename(path)
      // Danger: Handle the possibility no ACL is found and path === root is never true for some reason
    }

    // Read the file, reject any errors with 500
    const denied = accessDenied('called with parameters for a directory')
    if (denied) {
      reject(denied) // With various parameters
    }
    return true
  }

  function reject (err) {
    // Rejections can be 401, 403 or 500
  }

  function trimPath (path) {
    return path.substring(path.lastIndexOf('/')) 
  }
      
  function makeAclFilename (path) {
    return path + this.suffix
  }
    
  function isAcl (resource) {
    return resource.endsWith(this.suffix)
  }

}


module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
