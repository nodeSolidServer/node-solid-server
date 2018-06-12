'use strict'

const LdpOperation = require('./ldp-operation')

class LdpApi {
  /**
   * Usage:
   *   ```
   *   const store = new LdpFileStore({host, fetch, ...})
   *   const acl = new AclChecker({host, fetch, store, ...})
   *
   *   const ldp = new LdpApi({store, acl})
   *   ```
   *
   * @param options.store {LdpFileStore|LdpMemoryStore|LdpQuadStore} storage backend
   *   (either file system based, or in-memory, or SPARQL based quad store, etc)
   *
   * @param options.acl {AclChecker} ACL checker component
   */
  constructor (options) {
    this.store = options.store
    this.acl = options.acl
  }

  /**
   * Provides an Express handler for LDP API requests.
   * Authentication has already happened earlier in the middleware stack, stored
   * in session.
   * Usage:
   *   ```
   *   app.use('/', ldp.middleware)
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
  async middleware (req, res, next) {
    try {
      // parse target, operation, (optionally) body, preferences, store authn
      const operation = LdpOperation.from(req)

      // check that operation is permitted (throws error if not)
      const permissions = await this.acl.allow(operation)

      // perform the operation and return a response
      await operation.perform({res, permissions, store: this.store})
    } catch (error) {
      next(error)
    }
  }
}

module.exports = LdpApi
