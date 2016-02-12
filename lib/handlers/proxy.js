module.exports = addProxy

var request = require('request')
var cors = require('cors')
var debug = require('../debug')

function addProxy (app, path) {
  debug.settings('XSS Proxy listening to ' + path)
  app.get(
    path,
    cors({
      methods: ['GET'],
      exposedHeaders: 'User, Location, Link, Vary, Last-Modified, Content-Length',
      credentials: true,
      maxAge: 1728000,
      origin: true
    }),
    function (req, res) {
      debug.settings('originalUrl: ' + req.originalUrl)
      var uri = req.query.uri
      if (!uri) {
        return res
          .status(400)
          .send('Proxy has no uri param ')
      }

      debug.settings('Proxy destination URI: ' + uri)
      req.pipe(
        request.get(uri, function (err, body, response) {
          if (err) {
            res.sendStatus(err.code === 'ENOTFOUND' ? 404 : 500)
            return
          }
        }))
        .pipe(res)
    })
}
