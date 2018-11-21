'use strict'

const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')
const aclCheck = require('acl-check')

const DEFAULT_ACL_SUFFIX = '.acl'
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')

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
  async can (user, mode) {
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
    }

    // Obtain the permission set for the resource
    // this.acl.graph
    // this.resource
    // this.acl.isContainer ? this.resource : null
    // this.acl.acl
    // user
    // ACL(mode)
    // this.origin
    // this.trustedOrigins

    // console.log('ACL', this.origin, this.trustedOrigins)
    // console.log(aclCheck.accessDenied)
    // if (!this._permissionSet) {
    //   this._permissionSet = this.getNearestACL()
    //     .then(acl => this.getPermissionSet(acl))
    // }

    // aclCheck.checkAccess(acl.graph, this.resource)

    // Check the resource's permissions
    this.acl = this.acl || await this.getNearestACL().catch(err => {
      throw new HTTPError(403, `Found no ACL file:\n${err}`)
    })
    // console.log('TEST', this.acl)
    const resource = rdf.sym(this.resource)
    // const directory = this.acl.isContainer ? this.resource : null
    const directory = this.acl.isContainer ? rdf.sym(ACLChecker.getDirectory(this.acl.acl)) : null
    // console.log(ACLChecker.getDirectory(this.acl.acl))
    const aclFile = rdf.sym(this.acl.acl)
    // const agent = rdf.sym(user)
    const agent = user ? rdf.sym(user) : null
    // console.log('ACL agent', agent)
    // console.log('ACL FILE', this.resource, this.acl.acl)
    const modes = [ACL(mode)]
    const origin = this.origin ? rdf.sym(this.origin) : null
    const trustedOrigins = this.trustedOrigins ? this.trustedOrigins.map(trustedOrigin => rdf.sym(trustedOrigin)) : null
    const accessDenied = aclCheck.accessDenied(this.acl.graph, resource, directory, aclFile, agent, modes, origin, trustedOrigins)
    console.log('ACCESS DENIED', accessDenied, '\n\n')
    if (accessDenied && user) {
      throw new HTTPError(403, `Access to ${this.resource} denied for ${user}`)
    } else if (accessDenied) {
      throw new HTTPError(401, `Access to ${this.resource} requires authorization`)
    }
    return Promise.resolve(true)
  }

  // return Promise.resolve(true)
  // return this._permissionSet
  //   .then(acls => this.checkAccess(acls, user, mode))
  //   .catch(() => {
  //     if (!user) {
  //       throw new HTTPError(401, `Access to ${this.resource} requires authorization`)
  //     } else {
  //       throw new HTTPError(403, `Access to ${this.resource} denied for ${user}`)
  //     }
  //   })

  static getDirectory (aclFile) {
    const parts = aclFile.split('/')
    parts.pop()
    return `${parts.join('/')}/`
  }

// Gets the ACL that applies to the resource
  async getNearestACL () {
    const { resource } = this
    let isContainer = false
    // let directory = null
    // Create a cascade of reject handlers (one for each possible ACL)
    const possibleACLs = this.getPossibleACLs()
    const nearestACL = possibleACLs.reduce((prevACL, acl) => {
      return prevACL.catch(() => new Promise((resolve, reject) => {
        this.fetch(acl, (err, graph) => {
          if (err && err.code !== 'ENOENT') {
            isContainer = true
            reject(err)
          } else {
            const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
            debug(`Using ACL ${acl} for ${relative}`)
            resolve({ acl, graph, isContainer })
          }
        })
      }))
    }, Promise.reject())
    return nearestACL.catch(e => { throw new Error(`No ACL resource found, searched in \n- ${possibleACLs.join('\n- ')}`) })
  }

// Gets all possible ACL paths that apply to the resource
  getPossibleACLs () {
    // Obtain the resource URI and the length of its base
    let { resource: uri, suffix } = this
    const [{ length: base }] = uri.match(/^[^:]+:\/*[^/]+/)

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
    const options = { fetchGraph: this.fetchGraph }
    return permissionSet.checkAccess(this.resource, user, mode, options)
      .then(hasAccess => {
        if (hasAccess) {
          return true
        } else {
          throw new Error('ACL file found but no matching policy found')
        }
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
      trustedOrigins: this.trustedOrigins,
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
