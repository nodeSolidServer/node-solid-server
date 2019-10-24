const webid = require('webid/tls')
const debug = require('../../debug').authentication

function initialize (app, argv) {
  app.use('/', handler)
}

function handler (req, res, next) {
  // User already logged in? skip
  if (req.session.userId) {
    debug('User: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  }

  // No certificate? skip
  const certificate = getCertificateViaTLS(req)
  console.log(req.method)
  console.log(req.headers)
  console.log(req.body)
  console.log('CERTIFICATE')
  console.log(certificate)
  if (!certificate) {
    setEmptySession(req)
    return next()
  }

  // Verify webid
  webid.verify(certificate, function (err, result) {
    if (err) {
      debug('Error processing certificate: ' + err.message)
      setEmptySession(req)
      return next()
    }
    req.session.userId = result
    debug('Identified user: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  })
}

// Tries to obtain a client certificate retrieved through the TLS handshake
function getCertificateViaTLS (req) {
  const certificate = req.connection.getPeerCertificate &&
                      req.connection.getPeerCertificate()
  console.log('IN CERT')
  console.log(certificate)
  if (certificate && Object.keys(certificate).length > 0) {
    return certificate
  }
  debug('No peer certificate received during TLS handshake.')
}

function setEmptySession (req) {
  req.session.userId = ''
}

/**
 * Sets the `WWW-Authenticate` response header for 401 error responses.
 * Used by error-pages handler.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 */
function setAuthenticateHeader (req, res) {
  let locals = req.app.locals

  res.set('WWW-Authenticate', `WebID-TLS realm="${locals.host.serverUri}"`)
}

module.exports = {
  initialize,
  handler,
  setAuthenticateHeader,
  setEmptySession
}
