module.exports = addProxy

var request = require('request')
var cors = require('cors')
var http = require('http')
var https = require('https')
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

      var protocol = uri.split(':')[0]
      if (protocol === 'http') {
        request = http.get
      } else if (protocol === 'https') {
        request = https.get
      } else {
        return res.send(400)
      }

      var _req = request(uri, function (_res) {
        res.status(_res.statusCode)
        _res.pipe(res)
      })

      _req.end()
    })
}
