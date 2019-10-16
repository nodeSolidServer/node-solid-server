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
  exposedHeaders: 'Authorization, User, Location, Link, Vary, Last-Modified, Content-Length, Content-Location, MS-Author-Via',
  maxAge: 1728000,
  origin: true
}
const PROXY_SETTINGS = {
  target: 'dynamic',
  logLevel: 'silent',
  changeOrigin: true,
  followRedirects: true,
  proxyTimeout: 10000,
  router: req => req.destination.target,
  pathRewrite: (path, req) => req.destination.path
}
// https://en.wikipedia.org/wiki/Reserved_IP_addresses
const RESERVED_IP_RANGES = [
  '127.0.0.0/8',     // loopback
  '::1/128',         // loopback
  '0.0.0.0/8',       // current network (only valid as source address)
  '169.254.0.0/16',  // link-local
  '10.0.0.0/8',      // private network
  '100.64.0.0/10',   // Shared Address Space
  '172.16.0.0/12',   // private network
  '192.0.0.0/24',    // IETF Protocol Assignments
  '192.0.2.0/24',    // TEST-NET-1, documentation and examples
  '192.88.99.0/24',  // IPv6 to IPv4 relay (includes 2002::/16)
  '192.168.0.0/16',  // private network
  '198.18.0.0/15',   // network benchmark tests
  '198.51.100.0/24', // TEST-NET-2, documentation and examples
  '203.0.113.0/24',  // TEST-NET-3, documentation and examples
  '224.0.0.0/4',     // IP multicast (former Class D network)
  '240.0.0.0/4',     // reserved (former Class E network)
  '255.255.255.255', // broadcast
  '64:ff9b::/96',    // IPv4/IPv6 translation (RFC 6052)
  '100::/64',        // discard prefix (RFC 6666)
  '2001::/32',       // Teredo tunneling
  '2001:10::/28',    // deprecated (previously ORCHID
  '2001:20::/28',    // ORCHIDv2
  '2001:db8::/32',   // documentation and example source code
  '2002::/16',       // 6to4
  'fc00::/7',        // unique local address
  'fe80::/10',       // link-local address
  'ff00::/8'         // multicast
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
    if (error || RESERVED_IP_RANGES.some(r => ipRange(hostAddress, r))) {
      return res.status(400).send(`Cannot proxy ${uri}`)
    }
    req.destination = { path, target: `${protocol}//${host}` }
    next()
  }
}
