'use strict'

const HttpError = require('standard-http-error')

class LdpRequest {
  static from ({req, host}) {
    let request

    switch (req.method) {
      case 'head':
        /**
         * Checks to see if target exists
         */
        request = LdpHeadRequest.from({req, host})
        break
      case 'get':
        /**
         * Use cases to handle:
         *  - LdpListContainerRequest, if target is an ldp container
         *  - However, if Accept: header is HTML, check if index.html exists
         *  - Need to also support similar use case if index.ttl exists
         *  - Otherwise, plain LdpGetRequest
         */
        request = LdpGetRequest.from({req, host})
        break
      case 'put':
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
        request = LdpPutRequest.from({req, host})
        break
      case 'post':
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
        request = LdpPostRequest.from({req, host})
        break
      case 'patch':
        /**
         * Performs an LDP Patch operation. Like put, creates missing intermediate
         * containers in the path hierarchy.
         *
         * Throws:
         *  - 400 error if malformed patch syntax
         *  - 409 Conflict error if trying to DELETE triples that do not exist
         */
        request = LdpPatchRequest.from({req, host})
        break
      case 'delete':
        /**
         * Deletes resource or container
         *
         * Throws:
         * - 404 error if resource does not exist
         */
        request = LdpDeleteRequest.from({req, host})
        break
      case 'copy':
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
         * - 400 Source header required error if Source: header is missing
         */
        request = LdpCopyRequest.from({req, host})
        break
      case 'options':
        /**
         * Useful for server config discovery etc.
         * Note: Does not throw 404 errors. The semantics of OPTIONS are
         * "If this resource existed, here are the headers and properties
         *  it would have"
         */
        request = LdpOptionsRequest.from({req, host})
        break
      default:
        throw new HttpError(405, 'Method not supported')
    }

    return request
  }
}
