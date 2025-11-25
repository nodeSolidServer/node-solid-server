import * as webid from '../../webid/tls/index.mjs'
import debug from '../../debug.mjs'
const debugAuth = debug.authentication

export function initialize (app, argv) {
  app.use('/', handler)
}

export function handler (req, res, next) {
  // User already logged in? skip
  if (req.session.userId) {
    debugAuth('User: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  }

  // No certificate? skip
  const certificate = getCertificateViaTLS(req)
  if (!certificate) {
    setEmptySession(req)
    return next()
  }

  // Verify webid
  webid.verify(certificate, function (err, result) {
    if (err) {
      debugAuth('Error processing certificate: ' + err.message)
      setEmptySession(req)
      return next()
    }
    req.session.userId = result
    debugAuth('Identified user: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  })
}

// Tries to obtain a client certificate retrieved through the TLS handshake
function getCertificateViaTLS (req) {
  const certificate = req.connection.getPeerCertificate &&
                      req.connection.getPeerCertificate()
  if (certificate && Object.keys(certificate).length > 0) {
    return certificate
  }
  debugAuth('No peer certificate received during TLS handshake.')
}

export function setEmptySession (req) {
  req.session.userId = ''
}

/**
 * Sets the `WWW-Authenticate` response header for 401 error responses.
 * Used by error-pages handler.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
export function setAuthenticateHeader (req, res) {
  const locals = req.app.locals

  res.set('WWW-Authenticate', `WebID-TLS realm="${locals.host.serverUri}"`)
}

export default {
  initialize,
  handler,
  setAuthenticateHeader,
  setEmptySession
}