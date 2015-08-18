module.exports = function HTTPError(opts) {
  // Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = opts.message;
  this.status = opts.status;
};

require('util').inherits(module.exports, Error);