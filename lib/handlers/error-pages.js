module.exports = handler

var debug = require('../debug').server
var fs = require('fs')
var util = require('../utils')

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
    if (err.status === 401 &&
        req.accepts('text/html') &&
        ldp.auth === 'oidc') {
      debug('On error pages redirect on 401')
      res.status(err.status)
      redirectToLogin(req, res, next)
      return
    }
    res
      .status(err.status)
      .send(err.message + '\n' || '')
    return
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

function redirectBody (url) {
  return `<!DOCTYPE HTML>
<meta charset="UTF-8">
<script>
  window.location.href = "${url}"
</script>
<noscript>
  <meta http-equiv="refresh" content="0; url=${url}">
</noscript>
<title>Redirecting...</title>
If you are not redirected automatically, follow the <a href='${url}'>link to login</a>
`
}

function redirectToLogin (req, res) {
  res.header('Content-Type', 'text/html')
  var currentUrl = util.fullUrlForReq(req)
  req.session.returnToUrl = currentUrl
  let locals = req.app.locals
  let loginUrl = locals.host.serverUri + '/api/auth/select-provider?returnToUrl=' +
      currentUrl
  debug('Redirecting to login: ' + loginUrl)

  var body = redirectBody(loginUrl)
  res.send(body)
}
