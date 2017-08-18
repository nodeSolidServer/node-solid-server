'use strict'

const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')

const DEFAULT_ACL_SUFFIX = '.acl'

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.host = options.host
    this.origin = options.origin
    this.fetch = options.fetch
    this.strictOrigin = options.strictOrigin
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or rejects with an HTTP error otherwise
  can (user, mode) {
    debug(`Can ${user || 'an agent'} ${mode} ${this.resource}?`)
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
    }

    // Obtain the permission set for the resource
    if (!this._permissionSet) {
      this._permissionSet = this.getNearestACL()
        .then(acl => this.getPermissionSet(acl))
    }

    // Check the resource's permissions
    return this._permissionSet
      .then(acls => this.checkAccess(acls, user, mode))
      .catch(err => {
        debug(`Error: ${err.message}`)
        if (!user) {
          debug('Authentication required')
          throw new HTTPError(401, `Access to ${this.resource} requires authorization`)
        } else {
          debug(`${mode} access denied for ${user}`)
          throw new HTTPError(403, `Access to ${this.resource} denied for ${user}`)
        }
      })
  }

  // Gets the ACL that applies to the resource
  getNearestACL () {
    let isContainer = false
    // Create a cascade of reject handlers (one for each possible ACL)
    let nearestACL = Promise.reject()
    for (const acl of this.getPossibleACLs()) {
      nearestACL = nearestACL.catch(() => new Promise((resolve, reject) => {
        debug(`Check if ACL exists: ${acl}`)
        this.fetch(acl, (err, graph) => {
          if (err || !graph || !graph.length) {
            if (err) debug(`Error reading ${acl}: ${err}`)
            isContainer = true
            reject(err)
          } else {
            resolve({ acl, graph, isContainer })
          }
        })
      }))
    }
    return nearestACL.catch(e => { throw new Error('No ACL resource found') })
  }

  // Gets all possible ACL paths that apply to the resource
  getPossibleACLs () {
    // Obtain the resource URI and the length of its base
    let { resource: uri, suffix } = this
    const [ { length: base } ] = uri.match(/^[^:]+:\/*[^/]+/)

    // If the URI points to a file, append the file's ACL
    const possibleAcls = []
    if (!uri.endsWith('/')) {
      possibleAcls.push(uri.endsWith(suffix) ? uri : uri + suffix)
    }

    // Append the ACLs of all parent directories
    for (let i = lastSlash(uri); i >= base; i = lastSlash(uri, i - 1)) {
      possibleAcls.push(uri.substr(0, i + 1) + suffix)
    }
    return possibleAcls
  }

  // Tests whether the permissions allow a given operation
  checkAccess (permissionSet, user, mode) {
    return permissionSet.checkAccess(this.resource, user, mode)
      .then(hasAccess => {
        if (hasAccess) {
          debug(`${mode} access permitted to ${user}`)
          return true
        } else {
          debug(`${mode} access NOT permitted to ${user}`)
          throw new Error('ACL file found but no matching policy found')
        }
      })
      .catch(err => {
        debug(`${mode} access denied to ${user}`)
        debug(err)
        throw err
      })
  }

  // Gets the permission set for the given ACL
  getPermissionSet ({ acl, graph, isContainer }) {
    if (!graph || graph.length === 0) {
      debug('ACL ' + acl + ' is empty')
      throw new Error('No policy found - empty ACL')
    }
    const aclOptions = {
      aclSuffix: this.suffix,
      graph: graph,
      host: this.host,
      origin: this.origin,
      rdf: rdf,
      strictOrigin: this.strictOrigin,
      isAcl: uri => this.isAcl(uri),
      aclUrlFor: uri => this.aclUrlFor(uri)
    }
    return new PermissionSet(this.resource, acl, isContainer, aclOptions)
  }

  aclUrlFor (uri) {
    return this.isAcl(uri) ? uri : uri + this.suffix
  }

  isAcl (resource) {
    return resource.endsWith(this.suffix)
  }
}

// Returns the index of the last slash before the given position
function lastSlash (string, pos = string.length) {
  return string.lastIndexOf('/', pos)
}

module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
