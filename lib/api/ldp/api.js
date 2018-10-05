'use strict'

const { LdpOperation } = require('./ldp-operation')
const LdpTarget = require('./ldp-target')
const HttpError = require('standard-http-error')
const Negotiator = require('negotiator')

class LdpHttpHandler {
  /**
   * Usage:
   *   ```
   *   const mapperOptions = {
   *     rootUrl: host.serverUri,
   *     rootPath: host.root,
   *     includeHost: host.multiuser
   *   }
   *   const mapper = new LegacyResourceMapper(mapperOptions)
   *
   *   const storeOptions = {
   *     host, mapper, suffixMeta, suffixAcl, dataBrowserPath, suppressDataBrowser
   *   }
   *   const store = new LdpFileStore(storeOptions)
   *
   *   const acl = new AclChecker({host, fetch, store, ...})
   *
   *   const ldp = new LdpHttpHandler({store, acl, host, fetch})
   *   ```
   *
   * @param options.store {LdpFileStore|LdpMemoryStore|LdpQuadStore} storage backend
   *   (either file system based, or in-memory, or SPARQL based quad store, etc)
   *
   * @param options.acl {AclChecker} ACL checker component
   *
   * @param options.host {SolidHost} Server config object
   */
  constructor (options) {
    this.store = options.store
    this.acl = options.acl
    this.host = options.host
  }

  /**
   * Provides an Express handler for LDP API requests.
   * Authentication has already happened earlier in the middleware stack, stored
   * in session.
   * Usage:
   *   ```
   *   app.use('/', ldp.handleRequest)
   *   ```
   *
   * @see https://github.com/solid/solid-architecture/blob/master/server/request-flow.md
   *
   * @throws {Error} 401 If request not authenticated but resource is non-public
   *
   * @throws {Error} 404 If resource is not found, OR if found and request
   *   is not authorized to access it (default behavior, can be overridden by
   *   owner of resource)
   *
   * @throws {Error} 403 If request is not authorized to access resource and
   *   user has enabled "Request permission" action
   *
   * @throws {Error} 400 If invalid parameters (or error parsing request body,
   *   for cases like PATCH requests)
   *
   * @throws {Error} 409 If PATCH operation results in conflict
   *
   * @throws {Error} 406 If no appropriate representation found (for content type)
   *
   * @throws {Error} 405 If HTTP method not allowed / not implemented
   */
  async handleRequest (req, res, next) {
    try {
      const operation = await this.operationFrom(req)

      // check that operation is permitted (throws error if not)
      const permissions = await this.acl.allow(operation)

      // perform the operation and return a result
      const result = await operation.perform({store: this.store})

      // write both generic and op-specific headers
      // note: you need `permissions` for the WAC-Allow header
      operation.writeHeaders({res, result, permissions})

      operation.writeResponse({res, result})
    } catch (error) {
      next(error)
    }
  }

  /**
   * LdpOperation factory method
   *
   * @param req {IncomingRequest}
   *
   * @returns {Promise<LdpOperation>}
   */
  async operationFrom (req) {
    const options = this.parseOperation(req)

    const Operation = LdpOperation.BY_METHOD[options.method]
    if (!Operation) {
      throw new HttpError(405, 'Method not supported')
    }

    return Operation.from(options)
  }

  /**
   * @param req {IncomingRequest}
   *
   * @returns {object} Operation constructor params object
   */
  parseOperation (req) {
    const { method, headers, session: { authentication } } = req
    const target = this.targetFrom(req)

    const bodyStream = req // TODO: create a lazy parser here
    const store = this.store

    // Note: store is needed for LdpGetOperation factory
    return {method, target, headers, bodyStream, authentication, store}
  }

  targetFrom (req) {
    return new LdpTarget(this.parseTarget(req))
  }

  parseTarget (req) {
    const targetUrl = this.host.parseTargetUrl(req)
    const conneg = new Negotiator(req)

    return { name: req.path, url: targetUrl, conneg }
  }
}

module.exports = LdpHttpHandler
