const debug = require('../debug').server
const fs = require('fs')
const util = require('../utils')
const Auth = require('../api/authn')

/**
 * Serves as a last-stop error handler for all other middleware.
 *
 * @param err {Error}
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param next {Function}
 */
function handler (err, req, res, next) {
  debug('Error page because of:', err)

  let locals = req.app.locals
  let authMethod = locals.authMethod
  let ldp = locals.ldp

  // If the user specifies this function,
  // they can customize the error programmatically
  if (ldp.errorHandler) {
    debug('Using custom error handler')
    return ldp.errorHandler(err, req, res, next)
  }

  const statusCode = statusCodeFor(err, req, authMethod)
  switch (statusCode) {
    case 401:
      setAuthenticateHeader(req, res, err)
      renderLoginRequired(req, res, err)
      break
    case 403:
      renderNoPermission(req, res, err)
      break
    default:
      if (ldp.noErrorPages) {
        sendErrorResponse(statusCode, res, err)
      } else {
        sendErrorPage(statusCode, res, err, ldp)
      }
  }
}

/**
 * Returns the HTTP status code for a given request error.
 *
 * @param err {Error}
 * @param req {IncomingRequest}
 * @param authMethod {string}
 *
 * @returns {number}
 */
function statusCodeFor (err, req, authMethod) {
  let statusCode = err.status || err.statusCode || 500

  if (authMethod === 'oidc') {
    statusCode = Auth.oidc.statusCodeOverride(statusCode, req)
  }

  return statusCode
}

/**
 * Dispatches the writing of the `WWW-Authenticate` response header (used for
 * 401 Unauthorized responses).
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function setAuthenticateHeader (req, res, err) {
  let locals = req.app.locals
  let authMethod = locals.authMethod

  switch (authMethod) {
    case 'oidc':
      Auth.oidc.setAuthenticateHeader(req, res, err)
      break
    case 'tls':
      Auth.tls.setAuthenticateHeader(req, res)
      break
    default:
      break
  }
}

/**
 * Sends the HTTP status code and error message in the response.
 *
 * @param statusCode {number}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function sendErrorResponse (statusCode, res, err) {
  res.status(statusCode)
  res.header('Content-Type', 'text/plain;charset=utf-8')
  res.send(err.message + '\n')
}

/**
 * Sends the HTTP status code and error message as a custom error page.
 *
 * @param statusCode {number}
 * @param res {ServerResponse}
 * @param err {Error}
 * @param ldp {LDP}
 */
function sendErrorPage (statusCode, res, err, ldp) {
  let errorPage = ldp.errorPages + statusCode.toString() + '.html'

  return new Promise((resolve) => {
    fs.readFile(errorPage, 'utf8', (readErr, text) => {
      if (readErr) {
        // Fall back on plain error response
        return resolve(sendErrorResponse(statusCode, res, err))
      }

      res.status(statusCode)
      res.header('Content-Type', 'text/html')
      res.send(text)
      resolve()
    })
  })
}

/**
 * Renders a 401 response explaining that a login is required.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
function renderLoginRequired (req, res, err) {
  const currentUrl = util.fullUrlForReq(req)
  debug(`Display login-required for ${currentUrl}`)
  res.statusMessage = err.message
  res.status(401)
  res.render('auth/login-required', { currentUrl })
}

/**
 * Renders a 403 response explaining that the user has no permission.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
function renderNoPermission (req, res, err) {
  const currentUrl = util.fullUrlForReq(req)
  const webId = req.session.userId
  debug(`Display no-permission for ${currentUrl}`)
  res.statusMessage = err.message
  res.status(403)
  res.render('auth/no-permission', { currentUrl, webId })
}

/**
 * Returns a response body for redirecting browsers to a Select Provider /
 * login workflow page. Uses either a JS location.href redirect or an
 * http-equiv type html redirect for no-script conditions.
 *
 * @param url {string}
 *
 * @returns {string} Response body
 */
function redirectBody (url) {
  return `<!DOCTYPE HTML>
<meta charset="UTF-8">
<script>
  window.location.href = "${url}" + encodeURIComponent(window.location.hash)
</script>
<noscript>
  <meta http-equiv="refresh" content="0; url=${url}">
</noscript>
<title>Redirecting...</title>
If you are not redirected automatically,
follow the <a href='${url}'>link to login</a>
`
}

module.exports = {
  handler,
  redirectBody,
  sendErrorPage,
  sendErrorResponse,
  setAuthenticateHeader
}
