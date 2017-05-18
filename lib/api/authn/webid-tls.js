module.exports = handler
module.exports.authenticate = authenticate

var webid = require('webid/tls')
var debug = require('../../debug').authentication

function authenticate () {
  return handler
}

function handler (req, res, next) {
  // User already logged in? skip
  if (req.session.userId && req.session.identified) {
    debug('User: ' + req.session.userId)
    res.set('User', req.session.userId)
    return next()
  }

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
}

function setEmptySession (req) {
  req.session.userId = ''
  req.session.identified = false
}
