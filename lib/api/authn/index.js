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

/**
 * Sets the `User:` response header if the user has been authenticated.
 */
function setUserHeader (req, res, next) {
  let session = req.session
  let webId = session.identified && session.userId

  res.set('User', webId || '')
  next()
}

module.exports = {
  oidc: require('./webid-oidc'),
  overrideWith,
  setUserHeader
}
