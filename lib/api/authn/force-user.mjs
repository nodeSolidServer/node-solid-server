import debug from '../../debug.mjs'
const debugAuth = debug.authentication

/**
 * Enforces the `--force-user` server flag, hardcoding a webid for all requests,
 * for testing purposes.
 */
export function initialize (app, argv) {
  const forceUserId = argv.forceUser
  app.use('/', (req, res, next) => {
    debugAuth(`Identified user (override): ${forceUserId}`)
    req.session.userId = forceUserId
    if (argv.auth === 'tls') {
      res.set('User', forceUserId)
    }
    next()
  })
}

export default {
  initialize
}
