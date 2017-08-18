'use strict'

const path = require('path')
const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const url = require('url')
const HTTPError = require('./http-error')

const DEFAULT_ACL_SUFFIX = '.acl'

class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.host = options.host
    this.origin = options.origin
    this.debug = options.debug || console.log.bind(console)
    this.fetch = options.fetch
    this.strictOrigin = options.strictOrigin
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or a rejected promise otherwise
  can (user, mode) {
    this.debug(`Can ${user || 'an agent'} ${mode} ${this.resource}?`)
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
    }

    // Obtain the permission set for the resource
    if (!this._permissionSet) {
      this._permissionSet = this.getNearestACL()
        .then(acl => this.getPermissionSet(acl))
    }

    // Check the permissions
    return this._permissionSet.then(acls => this.checkAccess(acls, user, mode))
    .then(() => { this.debug('ACL policy found') })
    .catch(err => {
      this.debug(`Error: ${err.message}`)
      if (!user) {
        this.debug('Authentication required')
        throw new HTTPError(401, `Access to ${this.resource} requires authorization`)
      } else {
        this.debug(`${mode} access denied for ${user}`)
        throw new HTTPError(403, `Access to ${this.resource} denied for ${user}`)
      }
    })
  }

  // Gets the ACL that applies to the resource
  getNearestACL () {
    let isContainer = false
    let nearestACL = Promise.reject()
    for (const acl of this.getPossibleACLs()) {
      nearestACL = nearestACL.catch(() => new Promise((resolve, reject) => {
        this.debug(`Check if ACL exists: ${acl}`)
        this.fetch(acl, (err, graph) => {
          if (err || !graph || !graph.length) {
            if (err) this.debug(`Error reading ${acl}: ${err}`)
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

  // Get all possible ACL paths that apply to the resource
  getPossibleACLs () {
    var uri = this.resource
    var suffix = this.suffix
    var first = uri.endsWith(suffix) ? uri : uri + suffix
    var urls = [first]
    var parsedUri = url.parse(uri)
    var baseUrl = (parsedUri.protocol ? parsedUri.protocol + '//' : '') +
      (parsedUri.host || '')
    if (baseUrl + '/' === uri) {
      return urls
    }

    var times = parsedUri.pathname.split('/').length
    // TODO: improve temporary solution to stop recursive path walking above root
    if (parsedUri.pathname.endsWith('/')) {
      times--
    }

    for (var i = 0; i < times - 1; i++) {
      uri = path.dirname(uri)
      urls.push(uri + (uri[uri.length - 1] === '/' ? suffix : '/' + suffix))
    }
    return urls
  }

  // Tests whether the permissions allow a given operation
  checkAccess (permissionSet, user, mode) {
    return permissionSet.checkAccess(this.resource, user, mode)
    .then(hasAccess => {
      if (hasAccess) {
        this.debug(`${mode} access permitted to ${user}`)
        return true
      } else {
        this.debug(`${mode} access NOT permitted to ${user}`)
        throw new Error('ACL file found but no matching policy found')
      }
    })
    .catch(err => {
      this.debug(`${mode} access denied to ${user}`)
      this.debug(err)
      throw err
    })
  }

  // Gets the permission set for the given ACL
  getPermissionSet ({ acl, graph, isContainer }) {
    const debug = this.debug
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
    if (this.isAcl(uri)) {
      return uri
    } else {
      return uri + this.suffix
    }
  }

  isAcl (resource) {
    if (typeof resource === 'string') {
      return resource.endsWith(this.suffix)
    } else {
      return false
    }
  }
}

module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
