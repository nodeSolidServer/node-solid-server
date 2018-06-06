const express = require('express')
const { LoginRequest } = require('../../requests/login-request')
const bodyParser = require('body-parser').urlencoded({ extended: false })

const webid = require('webid/tls')
const webidUtil = require('../../webid_util')

const debug = require('../../debug').authentication
var x509 // optional dependency, load lazily
const HTTPError = require('../../http-error')

const CERTIFICATE_MATCHER = /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----$/m

var errMsg = null

function initialize (app, argv) {
  app.use('/', handler)
  if (argv.certificateHeader) {
    app.locals.certificateHeader = argv.certificateHeader.toLowerCase()
  }

  // Attach the API
  app.use('/', middleware())
}

function handler (req, res, next) {
  handleWebId(true, req, res, function (val) {
    next()
  })
}

function handleRegisterWebid (req, res, callback) {
  handleWebId(false, req, res, function (val) {
    const webid = req.session.userId
    val.webid = webid
    if (!val.certificate) {
      let rc = getRequestCertificate(req)
      val.certificate = rc.certificate
      if (!val.err) { val.err = rc.err }
    }
    if (!val.err) {
      webidUtil.createWebIdUtils().getInfoForWebID(webid)
         .then(function (info) {
           val.name = info.name
           callback(val)
         }).catch(function (e) {
           callback(val)
         })
    } else {
      return callback(val)
    }
  })
}

function handleWebId (isAuth, req, res, callback) {
  // No certificate? skip
  var httpErr = null
  const certificate = getCertificateViaTLS(req) || getCertificateViaHeader(req)
  if (!certificate) {
    if (isAuth) {
      setEmptySession(req)
    }

    if (errMsg) {
      httpErr = new HTTPError(401, errMsg)
    }

    return callback({err: errMsg, httpErr, certificate: null})
  }

  debug('#authenticate_using_web_id:')

  if (certificate.subjectaltname) {
    debug('SAN:', certificate.subjectaltname)

    var delegator = req.headers['on-behalf-of'] || req.headers['On-Behalf-Of']
    debug('#authenticate_using_web_id: delegator:', delegator)

    // Verify webid
    if (!delegator) {
      if (isAuth) {
        var uri = getUris(certificate)
         // User already logged in? skip
        if (uri.length > 0 && req.session.userId && req.session.userId === uri[0]) {
          debug('User: ' + req.session.userId)
          res.set('User', req.session.userId)
          return callback({err: null, httpErr: null, certificate})
        }
      }

      webid.verify(certificate, authenticationCallback)
    } else {
      // User already logged in? skip
      if (isAuth && req.session.userId && req.session.userId === delegator) {
        debug('User: ' + req.session.userId)
        res.set('User', req.session.userId)
        return callback({err: null, httpErr: null, certificate})
      }

      webid.verify(certificate, webidVerificationCallback)
    }
  } else {
    debug('Error: The client did not supply a valid certificate when first connecting to this server.')
    if (isAuth) {
      setEmptySession(req)
    }

    if (errMsg) {
      httpErr = new HTTPError(401, errMsg)
    }

    return callback({err: errMsg, httpErr, certificate})
  }

  // authenticationCallback signature: function(err, user)
  function authenticationCallback (err, uri) {
    if (err) {
      var msg = 'Error processing certificate: ' + err.message
      debug(msg)
      if (isAuth) {
        setEmptySession(req)
      }

      let httpErr = new HTTPError(401, msg)

      return callback({err: msg, httpErr, certificate})
    }
    req.session.userId = uri
    debug('Identified user: ' + req.session.userId)
    res.set('User', req.session.userId)

    return callback({err: null, httpErr: null, certificate})
  }

  function webidVerificationCallback (err, delegate) {
    if (err) {
      authenticationCallback(err, delegate)
    } else {
      if (delegate === delegator) {
        authenticationCallback(err, delegate)
      } else {
        webidVerifyDelegation(delegator, delegate, certificate, authenticationCallback)
      }
    }
  }

  function webidVerifyDelegation (delegator, delegate, delegateCertificate, authenticationCb) {
    // logger.debug('#webidVerifyDelegation: delegateCertificate: ');
    // logger.debug(util.inspect(delegateCertificate));

    // Depending on the client, it may inject an 'On-Behalf-Of' header with every request.
    // TO DO: Check - Does OSDS inject the header with every request?
    // So, the presence of an 'On-Behalf-Of' header is no guarantee that the delegate claim
    // is valid. The authenticated user, the apparent delegate, may not be a delegate at all.
    // This can only be confirmed by checking the authenticated user's WebID profile.

    // Verify the delegation claim
    webidUtil.createWebIdUtils().verifyDelegation(delegator, delegate, delegateCertificate)
    .then(function (result) {
      // result ::= true
      // The delegation claim is valid.
      // The effective user becomes the delegator.
      debug('#webidVerifyDelegation: delegation claim is valid')
      authenticationCb(null, delegator)
    }).catch(function (err) {
      // The delegation claim is invalid.
      // The effective user remains the authenticated user.
      debug('#webidVerifyDelegation: delegation claim is invalid')
      authenticationCb(err, delegate)
    })
  } // webidVerifyDelegation
}

function getUris (certificate) {
  var uris = []

  if (certificate && certificate.subjectaltname) {
    certificate
      .subjectaltname
      .replace(/URI:([^, ]+)/g, function (match, uri) {
        return uris.push(uri)
      })
  }
  return uris
}

function getRequestCertificate (req) {
  const certificate = getCertificateViaTLS(req) || getCertificateViaHeader(req)
  return {err: errMsg, certificate}
}

// Tries to obtain a client certificate retrieved through the TLS handshake
function getCertificateViaTLS (req) {
  const certificate = req.connection.getPeerCertificate &&
                      req.connection.getPeerCertificate()
  if (certificate && Object.keys(certificate).length > 0) {
    return certificate
  }
  errMsg = 'No peer certificate received during TLS handshake.'
  return debug(errMsg)
}

// Tries to obtain a client certificate retrieved through an HTTP header
function getCertificateViaHeader (req) {
  // Only allow header-based certificates if explicitly enabled
  const headerName = req.app.locals.certificateHeader
  if (!headerName) return

  // Try to retrieve the certificate from the header
  const header = req.headers[headerName]
  if (!header) {
    errMsg = `No certificate received through the ${headerName} header.`
    return debug(errMsg)
  }
  // The certificate's newlines have been replaced by tabs
  // in order to fit in an HTTP header (NGINX does this automatically)
  const rawCertificate = header.replace(/\t/g, '\n')

  // Ensure the header contains a valid certificate
  // (x509 unsafely interprets it as a file path otherwise)
  if (!CERTIFICATE_MATCHER.test(rawCertificate)) {
    return debug(`Invalid value for the ${headerName} header.`)
  }

  // Parse and convert the certificate to the format the webid library expects
  if (!x509) {
    try {
      x509 = require('x509')
    } catch (e) {
      x509 = { parseCert: () => { throw new Error() } }
    }
  }

  try {
    const { publicKey, extensions } = x509.parseCert(rawCertificate)
    return {
      modulus: publicKey.n,
      exponent: '0x' + parseInt(publicKey.e, 10).toString(16),
      subjectaltname: extensions && extensions.subjectAlternativeName
    }
  } catch (error) {
    errMsg = `Invalid certificate received through the ${headerName} header.`
    debug(errMsg)
  }
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

function middleware () {
  const router = express.Router('/')

  // User-facing Authentication API
  router.get(['/login', '/signin'], LoginRequest.get)

  router.post('/login/tls', bodyParser, LoginRequest.loginTls)

  return router
}

module.exports = {
  initialize,
  handler,
  setAuthenticateHeader,
  setEmptySession,
  handleRegisterWebid,
  getRequestCertificate
}
