'use strict'

const LdpRequest = require('./ldp-request')
const AclChecker = require('../acl-checker')
const LdpFileStore = require('../storage/ldp-file-store')

class LdpApi {
  /**
   * @param options.host {SolidHost} server host / config object
   *
   * @param options.store {LdpFileStore|LdpMemoryStore|LdpQuadStore} storage backend
   *   (either file system based, or in-memory, or SPARQL based quad store, etc)
   *
   * @param options.fetch {fetch} whatwg fetch, possibly with delegation in the
   *   future. Needed for COPY operations, etc.
   *
   * @param options.acl {AclChecker} ACL checker component
   */
  constructor (options) {
    this.host = options.host
    this.fetch = options.fetch
    this.store = options.store || new LdpFileStore(options)
    this.acl = options.acl ||
      new AclChecker({host: this.host, store: this.store, fetch: this.fetch})
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
      const request = LdpRequest.from({req, host: this.host})

      // check that operation is permitted (throws error if not)
      const permissions = await this.acl.allow(request)

      // perform the operation and return a response
      await request
        .handle({res, permissions, store: this.store, fetch: this.fetch})
    } catch (error) {
      next(error)
    }
  }
}

module.exports = LdpApi
