module.exports = handler

const debug = require('../debug').handlers

async function handler (req, res, next) {
  debug('DELETE -- Request on' + req.originalUrl)

  const ldp = req.app.locals.ldp

  try {
    await ldp.delete(req)
    debug('DELETE -- Ok.')

    if (req.app.locals.notMgr) {
      const message = {
        req: res.req,
        time: new Date().toUTCString()
      }
      const nm = req.app.locals.notMgr
      // console.log('delete nm: ')
      // console.log(nm)
      nm.emit('delete', 'aasdf')
      nm.emit('delete', message)
      // nm.emit('delete', message)
    }

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
