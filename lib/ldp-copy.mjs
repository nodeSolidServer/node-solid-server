import { handlers as debug } from './debug.mjs'
import fs from 'fs'
import { ensureDir } from 'fs-extra'
import HTTPError from './http-error.mjs'
import path from 'path'
import http from 'http'
import https from 'https'
import { getContentType } from './utils.mjs'

/**
 * Cleans up a file write stream (ends stream, deletes the file).
 * @method cleanupFileStream
 * @private
 * @param stream {WriteStream}
 */
function cleanupFileStream (stream) {
  const streamPath = stream.path
  stream.destroy()
  fs.unlinkSync(streamPath)
}

/**
 * Performs an LDP Copy operation, imports a remote resource to a local path.
 * @param resourceMapper {ResourceMapper} A resource mapper instance.
 * @param copyToUri {Object} The location (in the current domain) to copy to.
 * @param copyFromUri {String} Location of remote resource to copy from
 * @return A promise resolving when the copy operation is finished
 */
export default function copy (resourceMapper, copyToUri, copyFromUri) {
  return new Promise((resolve, reject) => {
    const request = /^https:/.test(copyFromUri) ? https : http

    const options = {
      rejectUnauthorized: false // Allow self-signed certificates for internal requests
    }

    request.get(copyFromUri, options)
      .on('error', function (err) {
        debug('COPY -- Error requesting source file: ' + err)
        this.end()
        return reject(new Error('Error writing data: ' + err))
      })
      .on('response', function (response) {
        if (response.statusCode !== 200) {
          debug('COPY -- HTTP error reading source file: ' + response.statusMessage)
          this.end()
          const error = new Error('Error reading source file: ' + response.statusMessage)
          error.statusCode = response.statusCode
          return reject(error)
        }
        // Grab the content type from the source
        const contentType = getContentType(response.headers)
        resourceMapper.mapUrlToFile({ url: copyToUri, createIfNotExists: true, contentType })
          .then(({ path: copyToPath }) => {
            ensureDir(path.dirname(copyToPath))
              .then(() => {
                const destinationStream = fs.createWriteStream(copyToPath)
                  .on('error', function (err) {
                    cleanupFileStream(this)
                    return reject(new Error('Error writing data: ' + err))
                  })
                  .on('finish', function () {
                    // Success
                    debug('COPY -- Wrote data to: ' + copyToPath)
                    resolve()
                  })
                response.pipe(destinationStream)
              })
              .catch(err => {
                debug('COPY -- Error creating destination directory: ' + err)
                return reject(new Error('Failed to create the path to the destination resource: ' + err))
              })
          })
          .catch((err) => {
            debug('COPY -- mapUrlToFile error: ' + err)
            reject(HTTPError(500, 'Could not find target file to copy'))
          })
      })
  })
}