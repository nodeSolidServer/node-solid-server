module.exports = handler

var debug = require('../debug').server
var fs = require('fs')

function handler (err, req, res, next) {
  debug('Error page because of ' + err.message)

  var ldp = req.app.locals.ldp

  // If the user specifies this function
  // then, they can customize the error programmatically
  if (ldp.errorHandler) {
    return ldp.errorHandler(err, req, res, next)
  }

  // If noErrorPages is set,
  // then use built-in express default error handler
  if (ldp.noErrorPages) {
    return res
      .status(err.status)
      .send(err.message + '\n' || '')
  }

  // Check if error page exists
  var errorPage = ldp.errorPages + err.status.toString() + '.html'
  fs.readFile(errorPage, 'utf8', function (readErr, text) {
    if (readErr) {
      return res
        .status(err.status)
        .send(err.message || '')
    }

    res.status(err.status)
    res.header('Content-Type', 'text/html')
    res.send(text)
  })
}
