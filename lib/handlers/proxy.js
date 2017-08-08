module.exports = addCorsProxyHandler

const proxy = require('http-proxy-middleware')
const cors = require('cors')
const debug = require('../debug')
const url = require('url')
const isIp = require('is-ip')
const ipRange = require('ip-range-check')
const validUrl = require('valid-url')

const CORS_SETTINGS = {
  methods: 'GET',
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, Content-Length',
  maxAge: 1728000,
  origin: true
}
const PROXY_SETTINGS = {
  target: 'dynamic',
  logLevel: 'silent',
  router: req => req.destination.target,
  pathRewrite: (path, req) => req.destination.path
}
const LOCAL_IP_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']

// Adds a CORS proxy handler to the application on the given path
function addCorsProxyHandler (app, path) {
  const corsHandler = cors(CORS_SETTINGS)
  const proxyHandler = proxy(PROXY_SETTINGS)

  debug.settings(`CORS proxy listening at ${path}?uri={uri}`)
  app.get(path, extractProxyConfig, corsHandler, proxyHandler)
}

// Extracts proxy configuration parameters from the request
function extractProxyConfig (req, res, next) {
  // Retrieve and validate the destination URL
  const uri = req.query.uri
  debug.settings(`Proxy request for ${uri}`)
  if (!uri) {
    return res.status(400)
      .send('Proxy has no uri param ')
  }
  if (!validUrl.isUri(uri)) {
    return res.status(406)
      .send('The uri passed is not valid')
  }

  // Ensure the host is not a local IP
  // TODO: guard against hostnames such as 'localhost' as well
  const { protocol, host, hostname, path } = url.parse(uri)
  if (isIp(hostname) && LOCAL_IP_RANGES.some(r => ipRange(hostname, r))) {
    return res
      .status(406)
      .send('Cannot proxy this IP')
  }

  // Add the proxy configuration to the request
  req.destination = { path, target: `${protocol}//${host}` }
  next()
}
