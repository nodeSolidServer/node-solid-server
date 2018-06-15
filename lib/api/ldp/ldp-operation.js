'use strict'

const url = require('url')
const glob = require('glob')
const HttpError = require('standard-http-error')
const LdpTarget = require('./ldp-target')

const BY_METHOD = {
  'head': LdpHeadOperation,
  'get': LdpGetOperation,
  'put': LdpPutOperation,
  'post': LdpPostOperation,
  'patch': LdpPatchOperation,
  'delete': LdpDeleteOperation,
  'copy': LdpCopyOperation,
  'options': LdpOptionsOperation
}

class LdpOperation {
  /**
   * @param options {object}
   *
   * @param options.target {LdpTarget}
   *
   * @param options.headers {object}
   *
   * @param [options.authentication=null] {Authentication} Authn object,
   *   contains WebID string, as well as any bearer credentials/tokens. Needed
   *   for authenticated fetch (of remote group ACLs, of Copy resources, etc).
   *   Null if request is not authenticated.
   *
   * @param [options.bodyStream] {Stream} Request body stream, for parsing when
   *   needed
   */
  constructor (options) {
    this.target = options.target
    this.headers = options.headers
    this.authentication = options.authentication
    this.bodyStream = options.bodyStream
  }

  /**
   * General construction method, overridden where needed (such as in
   * LdpGetOperation).
   *
   * @async (to match LdpGetOperation.from() which needs to access store)
   *
   * @param options {object}
   *
   * @returns {LdpOperation}
   */
  static async from (options) {
    const Operation = this
    return new Operation(options)
  }

  writeCommonHeaders ({res, result}) {
    // set headers in common to all LDP responses
    res.set('Content-Type', result.contentType)
    res.set('Content-Length', result.contentLength)
  }
}

LdpOperation.BY_METHOD = BY_METHOD

/**
 * Checks to see if target exists
 */
class LdpHeadOperation extends LdpOperation {
  writeHeaders ({res, result, permissions}) {
    this.writeCommonHeaders({res, result})
    // write HEAD-specific headers
  }

  /**
   * @param res {ServerResponse}
   */
  writeResponse ({res}) {
    res.sendStatus(200)
  }
}

/**
 * Use cases to handle:
 *  - "List Container" request, if target is an ldp container
 *  - However, if Accept: header is HTML, check if index.html exists
 *  - Need to also support similar use case if index.ttl exists
 *  - "Glob pattern request" if glob magic chars are detected (ie `*`)
 *  - HTTP Range request (partial bytes of a resource)
 *  - Otherwise, plain Get request
 */
class LdpGetOperation extends LdpOperation {
  /**
   * @param options
   *
   * @param options.target {LdpTarget}
   *
   * @returns {LdpGlobOperation|LdpListContainerOperation|LdpRangeOperation|LdpGetOperation}
   */
  static async from (options) {
    const { store, target, headers } = options

    // Note: current implementation only checks for glob magic after the backend
    // store could not find the file. Checking before that seems better.
    if (glob.hasMagic(target.url)) {
      return new LdpGlobOperation(options)
    }

    if (headers.range) {
      return new LdpRangeOperation(options)
    }

    if (target.isContainer) {
      // if it is a container, check to see if index.html exists
      const indexFileUrl = url.resolve(target.url, '/index.html')
      const indexFile = new LdpTarget({ url: indexFileUrl, conneg: target.conneg })

      if (await store.exists(indexFile) && target.mediaType() === 'text/html') {
        // This is a browser and an index file exists, return it
        return new LdpGetOperation({target: indexFile, ...options})
      }

      return new LdpListContainerOperation(options)
    }

    // plain get operation
    return new LdpGetOperation(options)
  }
}

class LdpRangeOperation extends LdpGetOperation {}

class LdpListContainerOperation extends LdpGetOperation {}

class LdpGlobOperation extends LdpGetOperation {}

/**
 * Creates a resource or container, and any necessary containers above it in
 * the hierarchy. Idempotent.
 *
 * If target is a container:
 *   - creates the container if none existed
 *   - does nothing if container exists, does not delete/clear existing contents
 *   - has `mkdir -p` semantics (creates missing container hierarchy)
 *
 * If target is a resource:
 *   - writes the resource, always overwriting existing contents if any existed
 *     (since we don't support conditional `If-None-Match` requests)
 *   - has `mkdir -p` semantics (creates missing container hierarchy)
 */
class LdpPutOperation extends LdpOperation {}

/**
 * Creates a new resource or container in the target container. The name of
 * this new resource is derived as follows:
 *
 *  - Use contents of `Slug` header, if provided and no resource with same
 *    name already exists
 *  - Use contents of Slug plus UUID, if resource with same name exists
 *  - Generate a UUID if no Slug given
 *
 * Does NOT use `mkdir -p` semantics (does not create missing containers)
 *
 * Throws:
 *  - 400 error if target doesn't end in a / (is not a container)
 *  - 404 error if target container does not exist
 */
class LdpPostOperation extends LdpOperation {}

/**
 * Performs an LDP Patch operation. Like put, creates missing intermediate
 * containers in the path hierarchy.
 *
 * Throws:
 *  - 400 error if malformed patch syntax
 *  - 409 Conflict error if trying to DELETE triples that do not exist
 */
class LdpPatchOperation extends LdpOperation {}

class LdpDeleteOperation extends LdpOperation {
  /**
   * Deletes resource or container
   *
   * Throws:
   * - 404 error if resource or container does not exist
   * - 409 Conflict error if deleting a non-empty container
   *
   * @returns {Promise}
   */
  async perform ({store}) {
    const resource = await store.resource(this.target)

    if (!resource.exists) {
      throw new HttpError(404)
    }

    if (resource.isContainer) {
      const container = resource
      await store.loadContainerContents(container)

      if (!store.isContainerEmpty(container)) {
        throw new HttpError(409, 'Container is not empty')
      }

      return store.deleteContainer(container)
    }

    return store.deleteResource(resource)
  }

  writeResponse ({res}) {
    // successfully deleted
    res.sendStatus(204, 'No content')
  }
}

/**
 * Handles HTTP COPY requests to import a given resource (specified in
 * the `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth
 * delegation is implemented), and is mainly intended for use with
 * "Save an external resource to Solid" type apps.
 *
 * Open questions:
 * - What to do if destination resource exists. (Currently overwrites it)
 * - Whether or not to create missing intermediate containers (like PUT
 *   does) - currently does not do this (behaves like POST)
 * - Future: Use an authenticated fetch (pass along the requester's
 *   bearer credentials, for example) so that they can COPY from
 *   private resources.
 *
 * Throws:
 * - 400 'Source header required' error if Source: header is missing
 * - 404 if source resource is not found
 */
class LdpCopyOperation extends LdpOperation {}

/**
 * Useful for server config discovery etc.
 * Note: Does not throw 404 errors. The semantics of OPTIONS are
 * "If this resource existed, here are the headers and properties
 *  it would have"
 */
class LdpOptionsOperation extends LdpOperation {}

module.exports = {
  LdpOperation
}
