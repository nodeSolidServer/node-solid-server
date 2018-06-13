'use strict'

const { LdpOperation } = require('./ldp-operation')
const HttpError = require('standard-http-error')

class LdpHttpHandler {
  /**
   * Usage:
   *   ```
   *   const store = new LdpFileStore({host, fetch, ...})
   *   const acl = new AclChecker({host, fetch, store, ...})
   *
   *   const ldp = new LdpHttpHandler({store, acl})
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
      const operation = this.operationFrom({req, store: this.store})

      // check that operation is permitted (throws error if not)
      const permissions = await this.acl.allow(operation)

      // perform the operation and return a response
      const result = await operation.perform({res, store: this.store})

      // write both generic and op-specific headers
      // note: you need `permissions` for the WAC-Allow header
      operation.writeHeaders({res, result, permissions})

      operation.writeResponse({res, result})
    } catch (error) {
      next(error)
    }
  }

  async operationFrom (req) {
    const options = this.parseOperation(req)

    const Operation = LdpOperation.BY_METHOD[options.method]
    if (!Operation) {
      throw new HttpError(405, 'Method not supported')
    }

    return new Operation(options)
  }

  /**
   * LdpOperation factory method
   *
   * @param req {IncomingRequest}
   *
   * @returns {Promise<LdpOperation>}
   */
  async parseOperation (req) {
    const { method, headers, session: { authentication } } = req

    const target = this.host.parseTargetUrl(req)
    const bodyStream = req // TODO: create a lazy parser here

    return {method, headers, target, bodyStream, authentication}
  }
}

module.exports = LdpHttpHandler
