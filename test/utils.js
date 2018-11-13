const fs = require('fs-extra')
const rimraf = require('rimraf')
const path = require('path')
const OIDCProvider = require('@solid/oidc-op')
const dns = require('dns')
const ldnode = require('../index')
const supertest = require('supertest')

const TEST_HOSTS = ['nic.localhost', 'tim.localhost', 'nicola.localhost']

exports.rm = function (file) {
  return rimraf.sync(path.join(__dirname, '/resources/' + file))
}

exports.cleanDir = function (dirPath) {
  fs.removeSync(path.join(dirPath, '.well-known/.acl'))
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
    'encoding': 'utf8'
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
        if (error || ip !== '127.0.0.1') {
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

exports.setupSuperServer = setupSuperServer
function setupSuperServer (options) {
  const ldpServer = createServer(options)
  return supertest(ldpServer)
}

/**
 * Creates a new test basic container via an LDP POST
 *   (located in `test/resources/{containerName}`)
 * @method createTestContainer
 * @param server {supertest} An instance of a supertest server
 * @param containerName {String} Container name used as slug, no leading `/`
 * @return {Promise} Promise obj, for use with Mocha's `before()` etc
 */
exports.createTestContainer = function createTestContainer (server, containerName) {
  return new Promise(function (resolve, reject) {
    server.post('/')
      .set('content-type', 'text/turtle')
      .set('slug', containerName)
      .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
      .set('content-type', 'text/turtle')
      .end(function (error, res) {
        error ? reject(error) : resolve(res)
      })
  })
}

/**
 * Creates a new turtle test resource via an LDP PUT
 *   (located in `test/resources/{resourceName}`)
 * @method createTestResource
 * @param resourceName {String} Resource name (should have a leading `/`)
 * @return {Promise} Promise obj, for use with Mocha's `before()` etc
 */
exports.createTestResource = function createTestResource (server, resourceName) {
  return new Promise(function (resolve, reject) {
    server.put(resourceName)
      .set('content-type', 'text/turtle')
      .end(function (error, res) {
        error ? reject(error) : resolve(res)
      })
  })
}
