module.exports = HTTPError

function HTTPError (status, message) {
  if (!(this instanceof HTTPError)) {
    return new HTTPError(status, message)
  }

  // Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name

  // If status is an object it will be of the form:
  // {status: , message: }
  if (typeof status === 'number') {
    this.message = message || 'Error occurred'
    this.status = status
  } else {
    var err = status
    this.message = message || err.message
    this.status = err.status || err.code === 'ENOENT' ? 404 : 500
  }
}
require('util').inherits(module.exports, Error)
