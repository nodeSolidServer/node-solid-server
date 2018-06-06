module.exports = handler

const debug = require('debug')('solid:put')

function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  debug(req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  ldp.put(req.hostname, req.path, req, function (err) {
    if (err) {
      debug('error putting the file:' + err.message)
      err.message = 'Can\'t write file: ' + err.message
      return next(err)
    }

    debug('succeded putting the file')

    res.sendStatus(201)
    return next()
  })
}
