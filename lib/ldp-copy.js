module.exports = copy

const debug = require('./debug')
const fs = require('fs')
const mkdirp = require('fs-extra').mkdirp
const path = require('path')
const request = require('request')

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
 * @param copyToPath {String} Local path to copy the resource into
 * @param copyFromUri {String} Location of remote resource to copy from
 * @param callback {Function} Node error callback
 */
function copy (copyToPath, copyFromUri, callback) {
  mkdirp(path.dirname(copyToPath), function (err) {
    if (err) {
      debug.handlers('COPY -- Error creating destination directory: ' + err)
      return callback(
        new Error('Failed to create the path to the destination resource: ' +
          err))
    }
    var destinationStream = fs.createWriteStream(copyToPath)
      .on('error', function (err) {
        cleanupFileStream(this)
        return callback(new Error('Error writing data: ' + err))
      })
      .on('finish', function () {
        // Success
        debug.handlers('COPY -- Wrote data to: ' + copyToPath)
        callback()
      })
    request.get(copyFromUri)
      .on('error', function (err) {
        debug.handlers('COPY -- Error requesting source file: ' + err)
        this.end()
        cleanupFileStream(destinationStream)
        return callback(new Error('Error writing data: ' + err))
      })
      .on('response', function (response) {
        if (response.statusCode !== 200) {
          debug.handlers('COPY -- HTTP error reading source file: ' +
            response.statusMessage)
          this.end()
          cleanupFileStream(destinationStream)
          let error = new Error('Error reading source file: ' + response.statusMessage)
          error.statusCode = response.statusCode
          return callback(error)
        }
      })
      .pipe(destinationStream)
  })
}
