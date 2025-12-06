import { server as debug } from '../debug.mjs'
import fs from 'fs'
import { fileURLToPath } from 'url'
import * as util from '../utils.mjs'
import Auth from '../api/authn/index.mjs'

function statusCodeFor (err, req, authMethod) {
  let statusCode = err.status || err.statusCode || 500

  if (authMethod === 'oidc') {
    statusCode = Auth.oidc.statusCodeOverride(statusCode, req)
  }

  return statusCode
}

export function setAuthenticateHeader (req, res, err) {
  const locals = req.app.locals
  const authMethod = locals.authMethod

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

export function sendErrorResponse (statusCode, res, err) {
  res.status(statusCode)
  res.header('Content-Type', 'text/plain;charset=utf-8')
  res.send(err.message + '\n')
}

export function sendErrorPage (statusCode, res, err, ldp) {
  const errorPage = ldp.errorPages + statusCode.toString() + '.html'

  return new Promise((resolve) => {
    fs.readFile(errorPage, 'utf8', (readErr, text) => {
      if (readErr) {
        return resolve(sendErrorResponse(statusCode, res, err))
      }

      res.status(statusCode)
      res.header('Content-Type', 'text/html')
      res.send(text)
      resolve()
    })
  })
}

function renderDataBrowser (req, res) {
  res.set('Content-Type', 'text/html')
  const ldp = req.app.locals.ldp
  const defaultDataBrowser = import.meta.resolve('mashlib/dist/databrowser.html')
  let dataBrowserPath = ldp.dataBrowserPath === 'default' ? defaultDataBrowser : ldp.dataBrowserPath
  debug('   sending data browser file: ' + dataBrowserPath)
  // `import.meta.resolve` returns a file:// URL string; convert it to a
  // filesystem path for `fs.readFileSync` when necessary.
  if (typeof dataBrowserPath === 'string' && dataBrowserPath.startsWith('file://')) {
    dataBrowserPath = fileURLToPath(dataBrowserPath)
  }
  const dataBrowserHtml = fs.readFileSync(dataBrowserPath, 'utf8')
  res.set('content-type', 'text/html')
  res.send(dataBrowserHtml)
}

export function handler (err, req, res, next) {
  debug('Error page because of:', err)

  const locals = req.app.locals
  const authMethod = locals.authMethod
  const ldp = locals.ldp

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

function renderLoginRequired (req, res, err) {
  const currentUrl = util.fullUrlForReq(req)
  debug(`Display login-required for ${currentUrl}`)
  res.statusMessage = err.message
  res.status(401)
  if (req.accepts('html')) {
    renderDataBrowser(req, res)
  } else {
    res.send('Not Authenticated')
  }
}

function renderNoPermission (req, res, err) {
  const currentUrl = util.fullUrlForReq(req)
  debug(`Display no-permission for ${currentUrl}`)
  res.statusMessage = err.message
  res.status(403)
  if (req.accepts('html')) {
    renderDataBrowser(req, res)
  } else {
    res.send('Not Authorized')
  }
}

export function redirectBody (url) {
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

export default {
  handler,
  redirectBody,
  sendErrorPage,
  sendErrorResponse,
  setAuthenticateHeader
}
