const express = require('express')
const { LoginRequest } = require('../../requests/login-request')
const bodyParser = require('body-parser').urlencoded({ extended: false })

var webid = require('webid/tls')
var debug = require('../../debug').authentication
var x509 // optional dependency, load lazily
const HTTPError = require('../../http-error')

const CERTIFICATE_MATCHER = /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----$/m

var err_msg = null;

function initialize (app, argv) {
  app.use('/', handler)
  if (argv.certificateHeader) {
    app.locals.certificateHeader = argv.certificateHeader.toLowerCase()
  }

  // Attach the API
  app.use('/', middleware())
}


function handler (req, res, next) {
  handle_webid(true, req, res, function(val) {
    next();
  });
}


function handle_register_webid (req, res, callback) {
  handle_webid(false, req, res, function(val) {

    const webid = req.session.userId;
    val.webid = webid;
    if (!val.certificate) {
      let rc = get_request_certificate(req);
      val.certificate = rc.certificate;
      if (!val.err)
        val.err = rc.err;
    }
    if (!val.err) {
       req.app.locals.webid_util.get_info_for_WebID(webid)
         .then(function (info) {
          val.name = info.name;
          callback(val);
        }).catch(function (e) {
          callback(val);
        });

    } else {
      return callback(val);
    }
  });
}


function handle_webid (is_auth, req, res, callback) {

  // User already logged in? skip
  if (req.session.userId && is_auth) {
    debug('User: ' + req.session.userId)
    res.set('User', req.session.userId)
    return callback({err:null, httpErr:null, certificate: null});
  }

  // No certificate? skip
  const certificate = getCertificateViaTLS(req) || getCertificateViaHeader(req)
  if (!certificate) {
    if (is_auth)
      setEmptySession(req)

    var httpErr = null;
    if (err_msg)
      httpErr = new HTTPError(401, err_msg)

    return callback({err:err_msg, httpErr, certificate: null});
  }

  debug('#authenticate_using_web_id:');

  if (certificate.subject)
  {
    debug('CN:', certificate.subject.CN, ', SAN:', certificate.subjectaltname); 
    
    var delegator = req.headers['on-behalf-of'] || req.headers['On-Behalf-Of'];
    debug('#authenticate_using_web_id: delegator:', delegator);

    // Verify webid
    if (!delegator)
      webid.verify(certificate, authentication_callback);
    else
      webid.verify(certificate, webid_verification_callback);
  }
  else
  {
    debug('Error: The client did not supply a valid certificate when first connecting to this server.')
    if (is_auth)
      setEmptySession(req)

    var httpErr = null;
    if (err_msg)
      httpErr = new HTTPError(401, err_msg)

    return callback({err:err_msg, httpErr, certificate});
  }


  // authentication_cb signature: function(err, user)
  function authentication_callback(err, uri) 
  {
    if (err) {
      var msg = 'Error processing certificate: ' + err.message;
      debug(msg)
      if (is_auth)
        setEmptySession(req)

      let httpErr = new HTTPError(401, msg)

      return callback({err:msg, httpErr, certificate});
    }
    req.session.userId = uri
    debug('Identified user: ' + req.session.userId)
    res.set('User', req.session.userId)

    return callback({err:null, httpErr:null, certificate});
  }

  function webid_verification_callback(err, delegate)
  {
    if (err) {
      authentication_callback(err, delegate);
    } else {
      if (delegate === delegator)
        authentication_callback(err, delegate);
      else
        webid_verify_delegation(delegator, delegate, certificate, authentication_callback);
    }
  }


  function webid_verify_delegation (delegator, delegate, delegate_certificate, authentication_cb) 
  {
    // logger.debug('#webid_verify_delegation: delegate_certificate: ');
    // logger.debug(util.inspect(delegate_certificate));

    // Depending on the client, it may inject an 'On-Behalf-Of' header with every request.
    // TO DO: Check - Does OSDS inject the header with every request?
    // So, the presence of an 'On-Behalf-Of' header is no guarantee that the delegate claim
    // is valid. The authenticated user, the apparent delegate, may not be a delegate at all.
    // This can only be confirmed by checking the authenticated user's WebID profile.

    // Verify the delegation claim
    req.app.locals.webid_util.verify_delegation(delegator, delegate, delegate_certificate)
    .then(function (result) {
      // result ::= true
      // The delegation claim is valid.
      // The effective user becomes the delegator.
      debug("#webid_verify_delegation: delegation claim is valid");
      authentication_cb(null, delegator);
    }).catch(function (err) {
      // The delegation claim is invalid.
      // The effective user remains the authenticated user. 
      debug("#webid_verify_delegation: delegation claim is invalid");
      authentication_cb(err, delegate);
    });
  } // webid_verify_delegation


}


function get_request_certificate (req) {
  const certificate = getCertificateViaTLS(req) || getCertificateViaHeader(req)
  return {err:err_msg, certificate};
}

// Tries to obtain a client certificate retrieved through the TLS handshake
function getCertificateViaTLS (req) {
  const certificate = req.connection.getPeerCertificate &&
                      req.connection.getPeerCertificate()
  if (certificate && Object.keys(certificate).length > 0) {
    return certificate
  }
  err_msg = 'No peer certificate received during TLS handshake.'
  return debug(err_msg)
}

// Tries to obtain a client certificate retrieved through an HTTP header
function getCertificateViaHeader (req) {
  // Only allow header-based certificates if explicitly enabled
  const headerName = req.app.locals.certificateHeader
  if (!headerName) return

  // Try to retrieve the certificate from the header
  const header = req.headers[headerName]
  if (!header) {
    err_msg = `No certificate received through the ${headerName} header.`
    return debug(err_msg)
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
  if (!x509) x509 = require('x509')
  try {
    const { publicKey, extensions } = x509.parseCert(rawCertificate)
    return {
      modulus: publicKey.n,
      exponent: '0x' + parseInt(publicKey.e, 10).toString(16),
      subjectaltname: extensions && extensions.subjectAlternativeName
    }
  } catch (error) {
    err_msg = `Invalid certificate received through the ${headerName} header.`
    debug(err_msg)
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
  handle_register_webid,
  get_request_certificate
}
