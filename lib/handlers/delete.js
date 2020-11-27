module.exports = handler

const debug = require('../debug').handlers
const error = require('../http-error')

async function handler (req, res, next) {
  debug('DELETE -- Request on' + req.originalUrl)

  // DELETE Pod root, method not allowed
  if (req.originalUrl === '/') {
    res.set('allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT')
    return next(error(405, 'DELETE Pod root is not allowed'))
  }

  const ldp = req.app.locals.ldp
  try {
    await ldp.delete(req)
    debug('DELETE -- Ok.')
    res.sendStatus(200)
    next()
  } catch (err) {
    debug('DELETE -- Failed to delete: ' + err)
    next(err)
  }
}
