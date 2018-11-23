'use strict'

// const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')
const aclCheck = require('acl-check')
const { URL } = require('url')

const DEFAULT_ACL_SUFFIX = '.acl'
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.resourceUrl = new URL(resource)
    this.agentOrigin = options.agentOrigin
    this.fetch = options.fetch
    this.fetchGraph = options.fetchGraph
    this.strictOrigin = options.strictOrigin
    this.trustedOrigins = options.trustedOrigins
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
    this.aclCached = {}
    this.messagesCached = {}
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or rejects with an HTTP error otherwise
  async can (user, mode) {
    const cacheKey = `${mode}-${user}`
    if (this.aclCached[cacheKey]) {
      return this.aclCached[cacheKey]
    }
    this.messagesCached[cacheKey] = this.messagesCached[cacheKey] || []

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
    const acl = await this.getNearestACL().catch(err => {
      this.messagesCached[cacheKey].push(new HTTPError(err.status || 500, err.message || err))
    })
    if (!acl) {
      this.aclCached[cacheKey] = Promise.resolve(false)
      return this.aclCached[cacheKey]
    }
    // console.log('TEST', this.acl)
    let resource = rdf.sym(this.resource)
    if (this.resource.endsWith('/' + this.suffix)) {
      // Then, the ACL file is for a directory
      resource = rdf.sym(ACLChecker.getDirectory(this.resource))
    }
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
      resource = rdf.sym(this.resource.substring(0, this.resource.length - this.suffix.length))
    }
    // const directory = acl.isContainer ? this.resource : null
    const directory = acl.isContainer ? rdf.sym(ACLChecker.getDirectory(acl.acl)) : null
    // console.log(ACLChecker.getDirectory(acl.acl))
    const aclFile = rdf.sym(acl.acl)
    // const agent = rdf.sym(user)
    const agent = user ? rdf.sym(user) : null
    // console.log('ACL agent', agent)
    // console.log('ACL FILE', this.resource, acl.acl)
    const modes = [ACL(mode)]
    const agentOrigin = this.agentOrigin ? rdf.sym(this.agentOrigin) : null
    const trustedOrigins = this.trustedOrigins ? this.trustedOrigins.map(trustedOrigin => rdf.sym(trustedOrigin)) : null
    console.log('TRUSTED ORIGINS', trustedOrigins, agentOrigin)
    const accessDenied = aclCheck.accessDenied(acl.graph, resource, directory, aclFile, agent, modes, agentOrigin, trustedOrigins)
    // console.log('ACCESS DENIED MESSAGE', accessDenied)
    console.log('DOMAIN', this.resourceUrl.origin, this.agentOrigin)
    console.log('USER', user)
    // if (accessDenied && this.agentOrigin && this.resourceUrl.origin !== this.agentOrigin) {
    //   this.messagesCached[cacheKey].push(new HTTPError(403, `No permission: Access to ${this.resource} denied for non-matching origin: ${accessDenied}`))
    // } else if (accessDenied && user) {
    if (accessDenied && user) {
      this.messagesCached[cacheKey].push(new HTTPError(403, `No permission: Access to ${this.resource} denied for ${user}: ${accessDenied}`))
    } else if (accessDenied) {
      this.messagesCached[cacheKey].push(new HTTPError(401, `Access to ${this.resource} requires authorization: ${accessDenied}`))
    }
    console.log('ACCESS ALLOWED', !accessDenied, user, '\n\n')
    this.aclCached[cacheKey] = Promise.resolve(!accessDenied)
    return this.aclCached[cacheKey]
  }

  async getError (user, mode) {
    const cacheKey = `${mode}-${user}`
    this.aclCached[cacheKey] = this.aclCached[cacheKey] || this.can(user, mode)
    const isAllowed = await this.aclCached[cacheKey]
    return isAllowed ? null : this.messagesCached[cacheKey].reduce((prevMsg, msg) => msg.status > prevMsg.status ? msg : prevMsg, { status: 0 })
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
    const acls = [...possibleACLs]
    let returnAcl = null
    while (possibleACLs.length > 0 && !returnAcl) {
      const acl = possibleACLs.shift()
      let graph
      try {
        graph = await this.fetch(acl)
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.status === 404)) {
          isContainer = true
          continue
        }
        console.error('ERROR IN getNearestACL', err.code, err)
        debug(err)
        throw err
      }

      const fetcher = new rdf.Fetcher(graph)
      fetcher.load(graph.each(null, ACL('agentGroup'), null))
/*
      try {
        await Promise.all(groups.map(async group => {
/*          const response = await fetch(group)
          const body = await response.text()
          return new Promise((resolve, reject) => {
            rdf.parse(body, graph, group, 'text/turtle', err => {
              if (err) {
                return reject(err)
              }
              resolve()
            })
          })
        }))
      } catch (error) {
        console.log('DAAAAAAAAAAAAAAAAAAHUUUUUUUUUUUUT', error)
      }
*/
      const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
      debug(`Using ACL ${acl} for ${relative}`)
      returnAcl = { acl, graph, isContainer }
    }
    if (!returnAcl) {
      throw new HTTPError(500, `No ACL found for ${resource}, searched in \n- ${acls.join('\n- ')}`)
    }
    return returnAcl
    // const nearestACL = possibleACLs.reduce((prevACL, acl) => {
    //   return prevACL.catch(() => new Promise((resolve, reject) => {
    //     this.fetch(acl, (err, graph) => {
    //       if (err && err.code !== 'ENOENT') {
    //         isContainer = true
    //         reject(err)
    //       } else {
    //         const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
    //         debug(`Using ACL ${acl} for ${relative}`)
    //         resolve({ acl, graph, isContainer })
    //       }
    //     })
    //   }))
    // }, Promise.reject())
    // return nearestACL.catch(e => { throw new Error(`No ACL resource found, searched in \n- ${possibleACLs.join('\n- ')}`) })
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
//   checkAccess (permissionSet, user, mode) {
//     const options = { fetchGraph: this.fetchGraph }
//     return permissionSet.checkAccess(this.resource, user, mode, options)
//       .then(hasAccess => {
//         if (hasAccess) {
//           return true
//         } else {
//           throw new Error('ACL file found but no matching policy found')
//         }
//       })
//   }

// Gets the permission set for the given ACL
//   getPermissionSet ({ acl, graph, isContainer }) {
//     if (!graph || graph.length === 0) {
//       debug('ACL ' + acl + ' is empty')
//       throw new Error('No policy found - empty ACL')
//     }
//     const aclOptions = {
//       aclSuffix: this.suffix,
//       graph: graph,
//       host: this.host,
//       origin: this.origin,
//       rdf: rdf,
//       strictOrigin: this.strictOrigin,
//       trustedOrigins: this.trustedOrigins,
//       isAcl: uri => this.isAcl(uri),
//       aclUrlFor: uri => this.aclUrlFor(uri)
//     }
//     return new PermissionSet(this.resource, acl, isContainer, aclOptions)
//   }

  // aclUrlFor (uri) {
  //   return this.isAcl(uri) ? uri : uri + this.suffix
  // }

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
