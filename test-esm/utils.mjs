// import fs from 'fs-extra' // see fs-extra/esm and fs-extra doc

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dns from 'dns'
import https from 'https'
import { createRequire } from 'module'
import fetch from 'node-fetch'
import rimraf from 'rimraf'
import fse from 'fs-extra'
import * as OIDCModule from '@solid/oidc-op'
import supertest from 'supertest'

// Import the main ldnode module (may need adjustment based on your ESM exports)
// const ldnode = require('../index.js') // or import as needed
import ldnode from '../index.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OIDCProvider = OIDCModule.Provider

const TEST_HOSTS = ['nic.localhost', 'tim.localhost', 'nicola.localhost']

// Configurable test root directory
// For custom route
// let TEST_ROOT = path.join(__dirname, '/resources/')
// For default root (process.cwd()):
let TEST_ROOT = path.join(process.cwd(), 'test-esm/resources')

export function setTestRoot (rootPath) {
  TEST_ROOT = rootPath
}
export function getTestRoot () {
  return TEST_ROOT
}

export function rm (file) {
  return rimraf.sync(path.join(TEST_ROOT, file))
}

export function cleanDir (dirPath) {
  fse.removeSync(path.join(dirPath, '.well-known/.acl'))
  fse.removeSync(path.join(dirPath, '.acl'))
  fse.removeSync(path.join(dirPath, 'favicon.ico'))
  fse.removeSync(path.join(dirPath, 'favicon.ico.acl'))
  fse.removeSync(path.join(dirPath, 'index.html'))
  fse.removeSync(path.join(dirPath, 'index.html.acl'))
  fse.removeSync(path.join(dirPath, 'robots.txt'))
  fse.removeSync(path.join(dirPath, 'robots.txt.acl'))
}

export function write (text, file) {
  console.log('Writing to', path.join(TEST_ROOT, file))
  // fs.mkdirSync(path.dirname(path.join(TEST_ROOT, file), { recursive: true }))
  return fs.writeFileSync(path.join(TEST_ROOT, file), text)
}

export function cp (src, dest) {
  return fse.copySync(
    path.join(TEST_ROOT, src),
    path.join(TEST_ROOT, dest))
}

export function read (file) {
  console.log('Reading from', path.join(TEST_ROOT, file))
  return fs.readFileSync(path.join(TEST_ROOT, file), {
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
    .then(() => {
      const config = require(configPath)

      const provider = new OIDCProvider(config)

      return provider.initializeKeyChain(config.keys)
    })
}

export function createServer (options) {
  console.log('Creating server with root:', options.root || process.cwd())
  return ldnode.createServer(options)
}

export function setupSupertestServer (options) {
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

export const httpRequest = requestAdapter

// Provide default export for compatibility
export default {
  rm,
  cleanDir,
  write,
  cp,
  read,
  backup,
  restore,
  checkDnsSettings,
  loadProvider,
  createServer,
  setupSupertestServer,
  httpRequest
}
