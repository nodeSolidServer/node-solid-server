module.exports = handler

const utils = require('../utils')
const mkdirp = require('fs-extra').mkdirp
const fs = require('fs')
const request = require('request')
const path = require('path')
const debug = require('../debug')
const error = require('../http-error')

/**
 * Cleans up a file write stream (ends stream, deletes the file).
 * @method cleanupFileStream
 * @param stream {WriteStream}
 */
function cleanupFileStream (stream) {
  let streamPath = stream.path
  stream.destroy()
  fs.unlinkSync(streamPath)
}

/**
 * Handles HTTP COPY requests to import a given resource (specified in the
 * `Source:` header) to a destination (specified in request path).
 * For the moment, you can copy from public resources only (no auth delegation
 * is implemented), and is mainly intended for use with
 * "Save an external resource to Solid" type apps.
 * @method handler
 */
function handler (req, res, next) {
  const copyFrom = req.header('Source')
  if (!copyFrom) {
    return next(error(400, 'Source header required'))
  }
  const serverRoot = utils.uriBase(req)
  const copyFromUrl = serverRoot + copyFrom
  const copyTo = res.locals.path || req.path
  const copyToPath = utils.reqToPath(req)

  mkdirp(path.dirname(copyToPath), function (err) {
    if (err) {
      debug.handlers('COPY -- Error creating destination directory: ' + err)
      return next(error(500,
        'Failed to create the path to the destination resource'))
    }
    var destinationStream = fs.createWriteStream(copyToPath)
      .on('error', function (err) {
        cleanupFileStream(this)
        return next(error(500, 'Error writing data: ' + err))
      })
      .on('finish', function () {
        debug.handlers('COPY -- Wrote data to: ' + copyToPath)
        res.set('Location', copyTo)
        res.sendStatus(201)
        next()
      })
    request.get(copyFromUrl)
      .on('error', function (err) {
        debug.handlers('COPY -- Error requesting source file: ' + err)
        this.end()
        cleanupFileStream(destinationStream)
        return next(error(500, 'Error writing data: ' + err))
      })
      .on('response', function (response) {
        if (response.statusCode !== 200) {
          debug.handlers('COPY -- HTTP error reading source file: ' +
            response.statusMessage)
          this.end()
          cleanupFileStream(destinationStream)
          return next(error(response.statusCode,
            'Error reading source file: ' + response.statusMessage))
        }
      })
      .pipe(destinationStream)
  })
}
