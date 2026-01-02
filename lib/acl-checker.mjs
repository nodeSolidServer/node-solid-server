'use strict'

import { dirname } from 'path'
import rdf from 'rdflib'
import { ACL as debug } from './debug.mjs'
// import { cache as debugCache } from './debug.mjs'
import HTTPError from './http-error.mjs'
import aclCheck from '@solid/acl-check'
import Url, { URL } from 'url'
import { promisify } from 'util'
import fs from 'fs'
import httpFetch from 'node-fetch'

export const DEFAULT_ACL_SUFFIX = '.acl'
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')

// TODO: expunge-on-write so that we can increase the caching time
// For now this cache is a big performance gain but very simple
// FIXME: set this through the config system instead of directly
// through an env var:
const EXPIRY_MS = parseInt(process.env.ACL_CACHE_TIME) || 10000 // 10 seconds
let temporaryCache = {}

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.resourceUrl = new URL(resource)
    this.agentOrigin = null
    try {
      if (options.strictOrigin && options.agentOrigin) {
        this.agentOrigin = rdf.sym(options.agentOrigin)
      }
    } catch (e) {
      // noop
    }
    this.fetch = options.fetch
    this.fetchGraph = options.fetchGraph
    this.trustedOrigins = options.strictOrigin && options.trustedOrigins ? options.trustedOrigins.map(trustedOrigin => rdf.sym(trustedOrigin)) : null
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
    this.aclCached = {}
    this.messagesCached = {}
    this.requests = {}
    this.slug = options.slug
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode; otherwise, rejects with an HTTP error
  async can (user, mode, method = 'GET', resourceExists = true) {
    const cacheKey = `${mode}-${user}`
    if (this.aclCached[cacheKey]) {
      return this.aclCached[cacheKey]
    }
    this.messagesCached[cacheKey] = this.messagesCached[cacheKey] || []

    // for method DELETE nearestACL and ACL from parent resource
    const acl = await this.getNearestACL(method).catch(err => {
      this.messagesCached[cacheKey].push(new HTTPError(err.status || 500, err.message || err))
    })
    if (!acl) {
      this.aclCached[cacheKey] = Promise.resolve(false)
      return this.aclCached[cacheKey]
    }
    let resource = rdf.sym(this.resource)
    let parentResource = resource
    if (!this.resource.endsWith('/')) { parentResource = rdf.sym(ACLChecker.getDirectory(this.resource)) }
    if (this.resource.endsWith('/' + this.suffix)) {
      resource = rdf.sym(ACLChecker.getDirectory(this.resource))
      parentResource = resource
    }
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
      const thisResource = this.resource.substring(0, this.resource.length - this.suffix.length)
      resource = rdf.sym(thisResource)
      parentResource = resource
      if (!thisResource.endsWith('/')) parentResource = rdf.sym(ACLChecker.getDirectory(thisResource))
    }
    const directory = acl.isContainer ? rdf.sym(ACLChecker.getDirectory(acl.docAcl)) : null
    const aclFile = rdf.sym(acl.docAcl)
    const aclGraph = acl.docGraph
    const agent = user ? rdf.sym(user) : null
    const modes = [ACL(mode)]
    const agentOrigin = this.agentOrigin
    const trustedOrigins = this.trustedOrigins
    let originTrustedModes = []
    try {
      this.fetch(aclFile.doc().value)
      originTrustedModes = await aclCheck.getTrustedModesForOrigin(aclGraph, resource, directory, aclFile, agentOrigin, (uriNode) => {
        return this.fetch(uriNode.doc().value, aclGraph)
      })
    } catch (e) {
      // FIXME: https://github.com/solid/acl-check/issues/23
      // console.error(e.message)
    }

    function resourceAccessDenied (modes) {
      return aclCheck.accessDenied(aclGraph, resource, directory, aclFile, agent, modes, agentOrigin, trustedOrigins, originTrustedModes)
    }
    function accessDeniedForAccessTo (modes) {
      const accessDeniedAccessTo = aclCheck.accessDenied(aclGraph, directory, null, aclFile, agent, modes, agentOrigin, trustedOrigins, originTrustedModes)
      const accessResult = !accessDenied && !accessDeniedAccessTo
      return accessResult ? false : accessDenied || accessDeniedAccessTo
    }
    async function accessdeniedFromParent (modes) {
      const parentAclDirectory = ACLChecker.getDirectory(acl.parentAcl)
      const parentDirectory = parentResource === parentAclDirectory ? null : rdf.sym(parentAclDirectory)
      const accessDeniedParent = aclCheck.accessDenied(acl.parentGraph, parentResource, parentDirectory, rdf.sym(acl.parentAcl), agent, modes, agentOrigin, trustedOrigins, originTrustedModes)
      const accessResult = !accessDenied && !accessDeniedParent
      return accessResult ? false : accessDenied || accessDeniedParent
    }

    let accessDenied = resourceAccessDenied(modes)
    // debugCache('accessDenied resource ' + accessDenied)

    // For create and update HTTP methods
    if ((method === 'PUT' || method === 'PATCH' || method === 'COPY')) {
      // if resource and acl have same parent container,
      // and resource does not exist, then accessTo Append from parent is required
      if (directory && directory.value === dirname(aclFile.value) + '/' && !resourceExists) {
        accessDenied = accessDeniedForAccessTo([ACL('Append')])
      }
      // debugCache('accessDenied PUT/PATCH ' + accessDenied)
    }

    // For delete HTTP method
    if ((method === 'DELETE')) {
      if (resourceExists) {
        // deleting a Container
        // without Read, the response code will reveal whether a Container is empty or not
        if (directory && this.resource.endsWith('/')) accessDenied = resourceAccessDenied([ACL('Read'), ACL('Write')])
        // if resource and acl have same parent container,
        // then both Read and Write on parent is required
        else if (!directory && aclFile.value.endsWith(`/${this.suffix}`)) accessDenied = await accessdeniedFromParent([ACL('Read'), ACL('Write')])

        // deleting a Document
        else if (directory && directory.value === dirname(aclFile.value) + '/') {
          accessDenied = accessDeniedForAccessTo([ACL('Write')])
        } else {
          accessDenied = await accessdeniedFromParent([ACL('Write')])
        }

      // https://github.com/solid/specification/issues/14#issuecomment-1712773516
      } else { accessDenied = true }
      // debugCache('accessDenied DELETE ' + accessDenied)
    }

    if (accessDenied && user) {
      this.messagesCached[cacheKey].push(HTTPError(403, accessDenied))
    } else if (accessDenied) {
      this.messagesCached[cacheKey].push(HTTPError(401, 'Unauthenticated'))
    }
    this.aclCached[cacheKey] = Promise.resolve(!accessDenied)
    return this.aclCached[cacheKey]
  }

  async getError (user, mode) {
    const cacheKey = `${mode}-${user}`
    // TODO ?? add to can: req.method and resourceExists.  Actually all tests pass
    this.aclCached[cacheKey] = this.aclCached[cacheKey] || this.can(user, mode)
    const isAllowed = await this.aclCached[cacheKey]
    return isAllowed ? null : this.messagesCached[cacheKey].reduce((prevMsg, msg) => msg.status > prevMsg.status ? msg : prevMsg, { status: 0 })
  }

  static getDirectory (aclFile) {
    const parts = aclFile.split('/')
    parts.pop()
    return `${parts.join('/')}/`
  }

  // Gets any ACLs that apply to the resource
  // DELETE uses docAcl when docAcl is parent to the resource
  // or docAcl and parentAcl when docAcl is the ACL of the Resource
  async getNearestACL (method) {
    const { resource } = this
    let isContainer = false
    const possibleACLs = this.getPossibleACLs()
    const acls = [...possibleACLs]
    let returnAcl = null
    let returnParentAcl = null
    let parentAcl = null
    let parentGraph = null
    let docAcl = null
    let docGraph = null
    while (possibleACLs.length > 0 && !returnParentAcl) {
      const acl = possibleACLs.shift()
      let graph
      try {
        this.requests[acl] = this.requests[acl] || this.fetch(acl)
        graph = await this.requests[acl]
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.status === 404)) {
          // only set isContainer before docAcl
          if (!docAcl) isContainer = true
          continue
        }
        debug(err)
        throw err
      }
      // const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
      // debug(`Using ACL ${acl} for ${relative}`)
      if (!docAcl) {
        docAcl = acl
        docGraph = graph
        // parentAcl is only needed for DELETE
        if (method !== 'DELETE') returnParentAcl = true
      } else {
        parentAcl = acl
        parentGraph = graph
        returnParentAcl = true
      }

      returnAcl = { docAcl, docGraph, isContainer, parentAcl, parentGraph }
    }
    if (!returnAcl) {
      throw new HTTPError(500, `No ACL found for ${resource}, searched in \n- ${acls.join('\n- ')}`)
    }
    // fetch group
    let groupNodes = returnAcl.docGraph.statementsMatching(null, ACL('agentGroup'), null)
    let groupUrls = groupNodes.map(node => node.object.value.split('#')[0])
    await Promise.all(groupUrls.map(async groupUrl => {
      try {
        const docGraph = await this.fetch(groupUrl, returnAcl.docGraph)
        this.requests[groupUrl] = this.requests[groupUrl] || docGraph
      } catch (e) {} // failed to fetch groupUrl
    }))
    if (parentAcl) {
      groupNodes = returnAcl.parentGraph.statementsMatching(null, ACL('agentGroup'), null)
      groupUrls = groupNodes.map(node => node.object.value.split('#')[0])
      await Promise.all(groupUrls.map(async groupUrl => {
        try {
          const docGraph = await this.fetch(groupUrl, returnAcl.parentGraph)
          this.requests[groupUrl] = this.requests[groupUrl] || docGraph
        } catch (e) {} // failed to fetch groupUrl
      }))
    }

    // debugAccounts('ALAIN returnACl ' + '\ndocAcl ' + returnAcl.docAcl + '\nparentAcl ' + returnAcl.parentAcl)
    return returnAcl
  }

  // Gets all possible ACL paths that apply to the resource
  getPossibleACLs () {
    // Obtain the resource URI and the length of its base
    const { resource: uri, suffix } = this
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

  isAcl (resource) {
    return resource.endsWith(this.suffix)
  }

  static createFromLDPAndRequest (resource, ldp, req) {
    const trustedOrigins = ldp.getTrustedOrigins(req)
    return new ACLChecker(resource, {
      agentOrigin: req.get('origin'),
      // host: req.get('host'),
      fetch: fetchLocalOrRemote(ldp.resourceMapper, ldp.serverUri),
      fetchGraph: (uri, options) => {
        // first try loading from local fs
        return ldp.getGraph(uri, options.contentType)
        // failing that, fetch remote graph
          .catch(() => ldp.fetchGraph(uri, options))
      },
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin,
      trustedOrigins,
      slug: decodeURIComponent(req.headers.slug)
    })
  }
}

/**
 * Returns a fetch document handler used by the ACLChecker to fetch .acl
 * resources up the inheritance chain.
 * The `fetch(uri, callback)` results in the callback, with either:
 *   - `callback(err, graph)` if any error is encountered, or
 *   - `callback(null, graph)` with the parsed RDF graph of the fetched resource
 * @return {Function} Returns a `fetch(uri, callback)` handler
 */
function fetchLocalOrRemote (mapper, serverUri) {
  async function doFetch (url) {
    // Convert the URL into a filename
    let body, path, contentType

    if (Url.parse(url).host.includes(Url.parse(serverUri).host)) {
      // Fetch the acl from local
      try {
        ({ path, contentType } = await mapper.mapUrlToFile({ url }))
      } catch (err) {
        // delete from cache
        delete temporaryCache[url]
        throw new HTTPError(404, err)
      }
      // Read the file from disk
      body = await promisify(fs.readFile)(path, { encoding: 'utf8' })
    } else {
      // Fetch the acl from the internet
      const response = await httpFetch(url)
      body = await response.text()
      contentType = response.headers.get('content-type')
    }
    return { body, contentType }
  }
  return async function fetch (url, graph = rdf.graph()) {
    graph.initPropertyActions(['sameAs']) // activate sameAs
    if (!temporaryCache[url]) {
      // debugCache('Populating cache', url)
      temporaryCache[url] = {
        timer: setTimeout(() => {
          // debugCache('Expunging from cache', url)
          delete temporaryCache[url]
          if (Object.keys(temporaryCache).length === 0) {
            // debugCache('Cache is empty again')
          }
        }, EXPIRY_MS),
        promise: doFetch(url)
      }
    }
    // debugCache('Cache hit', url)
    const { body, contentType } = await temporaryCache[url].promise
    // Parse the file as Turtle
    rdf.parse(body, graph, url, contentType)
    return graph
  }
}

// Returns the index of the last slash before the given position
function lastSlash (string, pos = string.length) {
  return string.lastIndexOf('/', pos)
}

export default ACLChecker

// Used in ldp and the unit tests:
export function clearAclCache (url) {
  if (url) delete temporaryCache[url]
  else temporaryCache = {}
}
