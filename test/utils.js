const fs = require('fs-extra')
const rimraf = require('rimraf')
const path = require('path')
const OIDCProvider = require('@solid/oidc-op')
const dns = require('dns')
const ldnode = require('../index')
const supertest = require('supertest')
const fetch = require('node-fetch')
const https = require('https')

const TEST_HOSTS = ['nic.localhost', 'tim.localhost', 'nicola.localhost']

exports.rm = function (file) {
  return rimraf.sync(path.join(__dirname, '/resources/' + file))
}

exports.cleanDir = function (dirPath) {
  fs.removeSync(path.join(dirPath, '.well-known/.acl'))
  fs.removeSync(path.join(dirPath, '.acl'))
  fs.removeSync(path.join(dirPath, 'favicon.ico'))
  fs.removeSync(path.join(dirPath, 'favicon.ico.acl'))
  fs.removeSync(path.join(dirPath, 'index.html'))
  fs.removeSync(path.join(dirPath, 'index.html.acl'))
  fs.removeSync(path.join(dirPath, 'robots.txt'))
  fs.removeSync(path.join(dirPath, 'robots.txt.acl'))
}

exports.write = function (text, file) {
  return fs.writeFileSync(path.join(__dirname, '/resources/' + file), text)
}

exports.cp = function (src, dest) {
  return fs.copySync(
    path.join(__dirname, '/resources/' + src),
    path.join(__dirname, '/resources/' + dest))
}

exports.read = function (file) {
  return fs.readFileSync(path.join(__dirname, '/resources/' + file), {
    encoding: 'utf8'
  })
}

// Backs up the given file
exports.backup = function (src) {
  exports.cp(src, src + '.bak')
}

// Restores a backup of the given file
exports.restore = function (src) {
  exports.cp(src + '.bak', src)
  exports.rm(src + '.bak')
}

// Verifies that all HOSTS entries are present
exports.checkDnsSettings = function () {
  return Promise.all(TEST_HOSTS.map(hostname => {
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, (error, ip) => {
        if (error || (ip !== '127.0.0.1' && ip !== '::1')) {
          reject(error)
        } else {
          resolve(true)
        }
      })
    })
  }))
    .catch(() => {
      throw new Error(`Expected HOSTS entries of 127.0.0.1 for ${TEST_HOSTS.join()}`)
    })
}

/**
 * @param configPath {string}
 *
 * @returns {Promise<Provider>}
 */
exports.loadProvider = function loadProvider (configPath) {
  return Promise.resolve()
    .then(() => {
      const config = require(configPath)

      const provider = new OIDCProvider(config)

      return provider.initializeKeyChain(config.keys)
    })
}

exports.createServer = createServer
function createServer (options) {
  return ldnode.createServer(options)
}

exports.setupSupertestServer = setupSuperServer
function setupSuperServer (options) {
  const ldpServer = createServer(options)
  return supertest(ldpServer)
}

// Lightweight adapter to replace `request` with `node-fetch` in tests
// Supports signatures:
//  - request(options, cb)
//  - request(url, options, cb)
// And methods: get, post, put, patch, head, delete, del
function buildAgentFn (options = {}) {
  const aOpts = options.agentOptions || {}
  if (!aOpts || (!aOpts.cert && !aOpts.key)) {
    return undefined
  }
  const httpsAgent = new https.Agent({
    cert: aOpts.cert,
    key: aOpts.key,
    // Tests often run with NODE_TLS_REJECT_UNAUTHORIZED=0; mirror that here
    rejectUnauthorized: false
  })
  return (parsedURL) => parsedURL.protocol === 'https:' ? httpsAgent : undefined
}

async function doFetch (method, url, options = {}, cb) {
  try {
    const headers = options.headers || {}
    const body = options.body
    const agent = buildAgentFn(options)
    const res = await fetch(url, { method, headers, body, agent })
    // Build a response object similar to `request`'s
    const headersObj = {}
    res.headers.forEach((value, key) => { headersObj[key] = value })
    const response = {
      statusCode: res.status,
      statusMessage: res.statusText,
      headers: headersObj
    }
    const hasBody = method !== 'HEAD'
    const text = hasBody ? await res.text() : ''
    cb(null, response, text)
  } catch (err) {
    cb(err)
  }
}

function requestAdapter (arg1, arg2, arg3) {
  let url, options, cb
  if (typeof arg1 === 'string') {
    url = arg1
    options = arg2 || {}
    cb = arg3
  } else {
    options = arg1 || {}
    url = options.url
    cb = arg2
  }
  const method = (options && options.method) || 'GET'
  return doFetch(method, url, options, cb)
}

;['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'DELETE'].forEach(m => {
  const name = m.toLowerCase()
  requestAdapter[name] = (options, cb) => doFetch(m, options.url, options, cb)
})
// Alias
requestAdapter.del = requestAdapter.delete

exports.httpRequest = requestAdapter
