'use strict'

const HttpError = require('standard-http-error')

const OPERATIONS = {
  'head': LdpHeadOperation,
  'get': LdpGetOperation,
  'put': LdpPutOperation,
  // etc
}

class LdpOperation {
  /**
   * @param options {object}
   *
   * @param options.target {URL} Parsed full request url
   *
   * @param options.headers {object}
   *
   * @param [options.authn=null] {object} Authentication object, contains WebID
   *   string, as well as any bearer credentials/tokens. Needed for
   *   authenticated fetch (of remote group ACLs, of Copy resources, etc).
   *   Null if request is not authenticated.
   *
   * @param [options.bodyStream] {Stream} Request body stream, for parsing when
   *   needed
   */
  constructor (options) {
    this.method = options.method
    this.authn = options.authn
    this.target = options.target
    this.headers = options.headers
    this.bodyStream = options.bodyStream
  }

  static async from ({req}) {
    const { method, headers } = req
    const authn = { webId: req.session.webId, credentials: {} } // <- bearer tokens go here
    const target = LdpOperation.parseTargetUrl(req)
    const bodyStream = req

    const Operation = OPERATIONS[method]
    if (!Operation) {
      throw new HttpError(405, 'Method not supported')
    }

    return Operation.from({method, headers, target, bodyStream, authn})
  }
}

/**
 * Checks to see if target exists
 */
class LdpHeadOperation extends LdpOperation {}

/**
 * Use cases to handle:
 *  - LdpListContainerRequest, if target is an ldp container
 *  - However, if Accept: header is HTML, check if index.html exists
 *  - Need to also support similar use case if index.ttl exists
 *  - Otherwise, plain LdpGetRequest
 */
class LdpGetOperation extends LdpOperation {}

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

/**
 * Deletes resource or container
 *
 * Throws:
 * - 404 error if resource or container does not exist
 * - 409 Conflict error if deleting a non-empty container
 */
class LdpDeleteOperation extends LdpOperation {}

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
