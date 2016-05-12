module.exports = handler

var webid = require('webid/tls')
var debug = require('../debug').authentication
var error = require('../http-error')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp

  if (ldp.forceUser) {
    req.session.userId = ldp.forceUser
    req.session.identified = true
    debug('Identified user: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  }

  // No webid required? skip
  if (!ldp.webid) {
    setEmptySession(req)
    return next()
  }

  // User already logged in? skip
  if (req.session.userId && req.session.identified) {
    debug('User: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  }

  if (ldp.auth === 'tls') {
    var certificate = req.connection.getPeerCertificate()
    // Certificate is empty? skip
    if (certificate === null || Object.keys(certificate).length === 0) {
      debug('No client certificate found in the request. Did the user click on a cert?')
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
      req.session.identified = true
      debug('Identified user: ' + req.session.userId)
      res.set('User', req.session.userId)
      return next()
    })
  } else if (ldp.auth === 'oidc') {
    return next(error(500, 'OIDC not implemented yet'))
  } else {
    return next(error(500, 'Authentication method not supported'))
  }
}

function setEmptySession (req) {
  req.session.userId = ''
  req.session.identified = false
}
