const debug = require('../debug').server
const fs = require('fs')
const util = require('../utils')
const Auth = require('../api/authn')

// Authentication methods that require a Provider Select page
const SELECT_PROVIDER_AUTH_METHODS = ['oidc']

/**
 * Serves as a last-stop error handler for all other middleware.
 *
 * @param err {Error}
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param next {Function}
 */
function handler (err, req, res, next) {
  debug('Error page because of ' + err)

  let locals = req.app.locals
  let authMethod = locals.authMethod
  let ldp = locals.ldp

  // If the user specifies this function,
  // they can customize the error programmatically
  if (ldp.errorHandler) {
    debug('Using custom error handler')
    return ldp.errorHandler(err, req, res, next)
  }

  let statusCode = statusCodeFor(err, req, authMethod)

  if (statusCode === 401) {
    debug(err, 'error:', err.error, 'desc:', err.error_description)
    setAuthenticateHeader(req, res, err)
  }

  if (requiresSelectProvider(authMethod, statusCode, req)) {
    return redirectToSelectProvider(req, res)
  }

  // If noErrorPages is set,
  // then return the response directly
  if (ldp.noErrorPages) {
    sendErrorResponse(statusCode, res, err)
  } else {
    sendErrorPage(statusCode, res, err, ldp)
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
 * Tests whether a given authentication method requires a Select Provider
 * page redirect for 401 error responses.
 *
 * @param authMethod {string}
 * @param statusCode {number}
 * @param req {IncomingRequest}
 *
 * @returns {boolean}
 */
function requiresSelectProvider (authMethod, statusCode, req) {
  if (statusCode !== 401) { return false }

  if (!SELECT_PROVIDER_AUTH_METHODS.includes(authMethod)) { return false }

  if (!req.accepts('text/html')) { return false }

  return true
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
 * Sends a 401 response with an HTML http-equiv type redirect body, to
 * redirect any users requesting a resource directly in the browser to the
 * Select Provider page and login workflow.
 * Implemented as a 401 + redirect body instead of a 302 to provide a useful
 * 401 response to REST/XHR clients.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
function redirectToSelectProvider (req, res) {
  res.status(401)
  res.header('Content-Type', 'text/html')

  let currentUrl = util.fullUrlForReq(req)
  req.session.returnToUrl = currentUrl

  let locals = req.app.locals
  let loginUrl = locals.host.serverUri +
    '/api/auth/select-provider?returnToUrl=' + currentUrl
  debug('Redirecting to Select Provider: ' + loginUrl)

  let body = redirectBody(loginUrl)
  res.send(body)
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
  window.location.href = "${url}"
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
  redirectToSelectProvider,
  requiresSelectProvider,
  sendErrorPage,
  sendErrorResponse,
  setAuthenticateHeader
}
