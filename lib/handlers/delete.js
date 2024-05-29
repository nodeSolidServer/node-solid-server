const rfc822Template = require('express-prep/templates').rfc822

module.exports = handler

const debug = require('../debug').handlers

async function handler (req, res, next) {
  debug('DELETE -- Request on' + req.originalUrl)

  const ldp = req.app.locals.ldp
  try {
    await ldp.delete(req)
    debug('DELETE -- Ok.')
    res.sendStatus(200)
    res.events.prep.trigger({
      generateNotifications: () => `\r\n${rfc822Template({ res })}`
    })
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
