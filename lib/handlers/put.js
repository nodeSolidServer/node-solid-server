module.exports = handler

var debug = require('debug')('solid:put')

function handler (req, res, next) {
  var ldp = req.app.locals.ldp
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

