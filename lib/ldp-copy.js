module.exports = copy

const debug = require('./debug')
const fs = require('fs')
const mkdirp = require('fs-extra').mkdirp
const error = require('./http-error')
const path = require('path')
const http = require('http')
const https = require('https')
const getContentType = require('./utils').getContentType

/**
 * Cleans up a file write stream (ends stream, deletes the file).
 * @method cleanupFileStream
 * @private
 * @param stream {WriteStream}
 */
function cleanupFileStream (stream) {
  let streamPath = stream.path
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
function copy (resourceMapper, copyToUri, copyFromUri) {
  return new Promise((resolve, reject) => {
    const request = /^https:/.test(copyFromUri) ? https : http
    request.get(copyFromUri)
      .on('error', function (err) {
        debug.handlers('COPY -- Error requesting source file: ' + err)
        this.end()
        return reject(new Error('Error writing data: ' + err))
      })
      .on('response', function (response) {
        if (response.statusCode !== 200) {
          debug.handlers('COPY -- HTTP error reading source file: ' + response.statusMessage)
          this.end()
          let error = new Error('Error reading source file: ' + response.statusMessage)
          error.statusCode = response.statusCode
          return reject(error)
        }
        // Grab the content type from the source
        const contentType = getContentType(response.headers)
        resourceMapper.mapUrlToFile({ url: copyToUri, createIfNotExists: true, contentType })
          .then(({ path: copyToPath }) => {
            mkdirp(path.dirname(copyToPath), function (err) {
              if (err) {
                debug.handlers('COPY -- Error creating destination directory: ' + err)
                return reject(new Error('Failed to create the path to the destination resource: ' + err))
              }
              const destinationStream = fs.createWriteStream(copyToPath)
                .on('error', function (err) {
                  cleanupFileStream(this)
                  return reject(new Error('Error writing data: ' + err))
                })
                .on('finish', function () {
                  // Success
                  debug.handlers('COPY -- Wrote data to: ' + copyToPath)
                  resolve()
                })
              response.pipe(destinationStream)
            })
          })
          .catch(() => reject(error(500, 'Could not find target file to copy')))
      })
  })
}
