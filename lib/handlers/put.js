exports.handler = handler;

var debug = require('../debug').handlers;

function handler (req, res, next) {
  var ldp = req.app.locals.ldp;
  debug('PUT -- originalUrl: ' + req.originalUrl);
  res.header('MS-Author-Via', 'SPARQL');

  ldp.put(req.hostname, req.path, req.text, function (err) {
    if (err) {
      debug('PUT -- Write error: ' + err.message);
      err.message = 'Can\'t write file: ' + err.message;
      return next(err);
    }

    debug('PUT -- Write Ok. Bytes written: ' + req.text.length);

    res.sendStatus(201);
    return next();
  });
}
