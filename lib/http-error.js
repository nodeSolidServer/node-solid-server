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
    const err = status
    let _status
    let _code
    let _message
    if (err && err.status) {
      _status = err.status
    }
    if (err && err.code) {
      _code = err.code
    }
    if (err && err.message) {
      _message = err.message
    }
    this.message = message || _message
    this.status = _status || _code === 'ENOENT' ? 404 : 500
  }
}
require('util').inherits(module.exports, Error)
