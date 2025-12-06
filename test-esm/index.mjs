import fs from 'fs-extra'
import rimraf from 'rimraf'
import path from 'path'
import { fileURLToPath } from 'url'
import OIDCProvider from '@solid/oidc-op'
import dns from 'dns'
import ldnode from '../index.js'
// import ldnode from '../index.mjs'
import supertest from 'supertest'
import fetch from 'node-fetch'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_HOSTS = ['nic.localhost', 'tim.localhost', 'nicola.localhost']

export function rm (file) {
  return rimraf.sync(path.normalize(path.join(__dirname, '../../test-esm/resources/' + file)))
}

export function cleanDir (dirPath) {
  fs.removeSync(path.normalize(path.join(dirPath, '.well-known/.acl')))
  fs.removeSync(path.normalize(path.join(dirPath, '.acl')))
  fs.removeSync(path.normalize(path.join(dirPath, 'favicon.ico')))
  fs.removeSync(path.normalize(path.join(dirPath, 'favicon.ico.acl')))
  fs.removeSync(path.normalize(path.join(dirPath, 'index.html')))
  fs.removeSync(path.normalize(path.join(dirPath, 'index.html.acl')))
  fs.removeSync(path.normalize(path.join(dirPath, 'robots.txt')))
  fs.removeSync(path.normalize(path.join(dirPath, 'robots.txt.acl')))
}

export function write (text, file) {
  return fs.writeFileSync(path.normalize(path.join(__dirname, '../../test-esm/resources/' + file)), text)
}

export function cp (src, dest) {
  return fs.copySync(
    path.normalize(path.join(__dirname, '../../test-esm/resources/' + src)),
    path.normalize(path.join(__dirname, '../../test-esm/resources/' + dest)))
}

export function read (file) {
  return fs.readFileSync(path.normalize(path.join(__dirname, '../../test-esm/resources/' + file)), {
    encoding: 'utf8'
  })
}

// Backs up the given file
export function backup (src) {
  cp(src, src + '.bak')
}

// Restores a backup of the given file
export function restore (src) {
  cp(src + '.bak', src)
  rm(src + '.bak')
}

// Verifies that all HOSTS entries are present
export function checkDnsSettings () {
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
export function loadProvider (configPath) {
  return Promise.resolve()
    .then(async () => {
      const { default: config } = await import(configPath)

      const provider = new OIDCProvider(config)

      return provider.initializeKeyChain(config.keys)
    })
}

export { createServer }
function createServer (options) {
  return ldnode.createServer(options)
}

export { setupSupertestServer }
function setupSupertestServer (options) {
  const ldpServer = ldnode.createServer(options)
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

export const httpRequest = requestAdapter