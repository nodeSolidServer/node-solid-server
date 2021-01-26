module.exports = handler

const debug = require('../debug').handlers

async function handler (req, res, next) {
  debug('DELETE -- Request on' + req.originalUrl)

  const ldp = req.app.locals.ldp
  try {
    await ldp.delete(req)
    debug('DELETE -- Ok.')
    res.sendStatus(200)
    next()
  } catch (err) {
    debug('DELETE -- Failed to delete: ' + err)

    // method DELETE not allowed
    if (err.status === 405) {
      res.set('allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT')
    }
    next(err)
  }
}
