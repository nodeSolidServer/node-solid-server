const debug = require('../../debug').authentication

/**
 * Enforces the `--force-user` server flag, hardcoding a webid for all requests,
 * for testing purposes.
 */
function initialize (app, argv) {
  const forceUserId = argv.forceUser
  app.use('/', (req, res, next) => {
    debug(`Identified user (override): ${forceUserId}`)
    req.session.userId = forceUserId
    if (argv.auth === 'tls') {
      res.set('User', forceUserId)
    }
    next()
  })
}

module.exports = {
  initialize
}
