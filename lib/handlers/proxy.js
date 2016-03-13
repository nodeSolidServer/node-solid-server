module.exports = addProxy

var request = require('request')
var cors = require('cors')
var http = require('http')
var https = require('https')
var debug = require('../debug')
var url = require('url')

function addProxy (app, path) {
  debug.settings('XSS/CORS Proxy listening at /' + path + '?uri={uri}')
  app.get(
    path,
    cors({
      methods: ['GET'],
      exposedHeaders: 'User, Location, Link, Vary, Last-Modified, Content-Length',
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

      // Set the headers and uri of the proxied request
      var opts = url.parse(uri)
      opts.headers = req.headers
      // See https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html
      delete opts.headers.connection
      delete opts.headers.host

      var _req = request(opts, function (_res) {
        res.status(_res.statusCode)
        // Set the response with the same header of proxied response
        Object.keys(_res.headers).forEach(function (header) {
          if (!res.get(header)) {
            res.setHeader(header.trim(), _res.headers[header])
          }
        })
        _res.pipe(res)
      })

      _req.on('error', function (e) {
        res.send(500, 'Cannot proxy')
      })

      _req.end()
    })
}
