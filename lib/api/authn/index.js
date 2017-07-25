'use strict'

const debug = require('../../debug').authentication

/**
 * Enforces the `--force-user` server flag, hardcoding a webid for all requests,
 * for testing purposes.
 */
function overrideWith (forceUserId) {
  return (req, res, next) => {
    req.session.userId = forceUserId
    req.session.identified = true
    debug('Identified user (override): ' + forceUserId)
    res.set('User', forceUserId)
    return next()
  }
}

module.exports = {
  oidc: require('./webid-oidc'),
  tls: require('./webid-tls'),
  overrideWith
}
