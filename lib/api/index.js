'use strict'

/**
 * Handles a request to a not implemented `/api/` endpoint.
 * @param req
 * @param res
 * @param next
 */
function notImplemented (req, res, next) {
  res.status(404).send('API not implemented')
}

module.exports = {
  accounts: require('./accounts'),
  messages: require('./messages'),
  notImplemented,
  userAccounts: require('./accounts/user-accounts')
}
