module.exports = addProxy

const cors = require('cors')
const http = require('http')
const https = require('https')
const debug = require('../debug')
const url = require('url')
const isIp = require('is-ip')
const ipRange = require('ip-range-check')
const validUrl = require('valid-url')

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
    (req, res) => {
      if (!validUrl.isUri(req.query.uri)) {
        return res
          .status(406)
          .send('The uri passed is not valid')
      }

      debug.settings('proxy received: ' + req.originalUrl)

      const hostname = url.parse(req.query.uri).hostname

      if (isIp(hostname) && (
          ipRange(hostname, '10.0.0.0/8') ||
          ipRange(hostname, '172.16.0.0/12') ||
          ipRange(hostname, '192.168.0.0/16')
        )) {
        return res
          .status(406)
          .send('Cannot proxy this IP')
      }
      const uri = req.query.uri
      if (!uri) {
        return res
          .status(400)
          .send('Proxy has no uri param ')
      }

      debug.settings('Proxy destination URI: ' + uri)

      const protocol = uri.split(':')[0]
      let request
      if (protocol === 'http') {
        request = http.get
      } else if (protocol === 'https') {
        request = https.get
      } else {
        return res.send(400)
      }

      // Set the headers and uri of the proxied request
      const opts = url.parse(uri)
      opts.headers = req.headers
      // See https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html
      delete opts.headers.connection
      delete opts.headers.host

      const _req = request(opts, (_res) => {
        res.status(_res.statusCode)
        // Set the response with the same header of proxied response
        Object.keys(_res.headers).forEach((header) => {
          if (!res.get(header)) {
            res.setHeader(header.trim(), _res.headers[header])
          }
        })
        _res.pipe(res)
      })

      _req.on('error', (e) => {
        res.send(500, 'Cannot proxy')
      })

      _req.end()
    })
}
