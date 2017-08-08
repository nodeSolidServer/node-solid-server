module.exports = addCorsProxyHandler

const proxy = require('http-proxy-middleware')
const cors = require('cors')
const debug = require('../debug')
const url = require('url')
const dns = require('dns')
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
const LOCAL_IP_RANGES = [
  '10.0.0.0/8',
  '127.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16'
]

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
  if (!validUrl.isUri(uri)) {
    return res.status(400).send(`Invalid URL passed: ${uri || '(none)'}`)
  }

  // Parse the URL and retrieve its host's IP address
  const { protocol, host, hostname, path } = url.parse(uri)
  if (isIp(hostname)) {
    addProxyConfig(null, hostname)
  } else {
    dns.lookup(hostname, addProxyConfig)
  }

  // Verifies and adds the proxy configuration to the request
  function addProxyConfig (error, hostAddress) {
    // Ensure the host is not a local IP
    if (error || LOCAL_IP_RANGES.some(r => ipRange(hostAddress, r))) {
      return res.status(400).send(`Cannot proxy ${uri}`)
    }
    req.destination = { path, target: `${protocol}//${host}` }
    next()
  }
}
