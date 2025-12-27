import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import chai from 'chai'

// Import utility functions from the ESM utils
import { httpRequest as request, rm } from '../utils.mjs'
import ldnode from '../../index.mjs'
const solidServer = ldnode.default || ldnode

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { assert } = chai

describe('HTTP COPY API', function () {
  this.timeout(10000) // Set timeout for this test suite to 10 seconds

  const address = 'https://localhost:8443'

  let ldpHttpsServer
  const ldp = solidServer.createServer({
    root: path.join(__dirname, '../resources/accounts/localhost/'),
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    serverUri: 'https://localhost:8443',
    webid: false
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(8443, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    // Clean up after COPY API tests
    return Promise.all([
      rm('/accounts/localhost/sampleUser1Container/nicola-copy.jpg')
    ])
  })

  const userCredentials = {
    user1: {
      cert: fs.readFileSync(path.join(__dirname, '../keys/user1-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '../keys/user1-key.pem'))
    },
    user2: {
      cert: fs.readFileSync(path.join(__dirname, '../keys/user2-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '../keys/user2-key.pem'))
    }
  }

  function createOptions (method, url, user) {
    const options = {
      method,
      url,
      headers: {}
    }
    if (user) {
      options.agentOptions = userCredentials[user]
    }
    return options
  }

  it('should create the copied resource', function (done) {
    const copyFrom = '/samplePublicContainer/nicola.jpg'
    const copyTo = '/sampleUser1Container/nicola-copy.jpg'
    const uri = address + copyTo
    const options = createOptions('COPY', uri, 'user1')
    options.headers.Source = copyFrom
    request(uri, options, function (error, response, body) {
      if (error) {
        return done(error)
      }
      assert.equal(response.statusCode, 201)
      assert.equal(response.headers.location, copyTo)
      const destinationPath = path.join(__dirname, '../resources/accounts/localhost', copyTo)
      assert.ok(fs.existsSync(destinationPath),
        'Resource created via COPY should exist')
      done()
    })
  })

  it('should give a 404 if source document doesn\'t exist', function (done) {
    const copyFrom = '/samplePublicContainer/invalid-resource'
    const copyTo = '/sampleUser1Container/invalid-resource-copy'
    const uri = address + copyTo
    const options = createOptions('COPY', uri, 'user1')
    options.headers.Source = copyFrom
    request(uri, options, function (error, response) {
      if (error) {
        return done(error)
      }
      assert.equal(response.statusCode, 404)
      done()
    })
  })

  it('should give a 400 if Source header is not supplied', function (done) {
    const copyTo = '/sampleUser1Container/nicola-copy.jpg'
    const uri = address + copyTo
    const options = createOptions('COPY', uri, 'user1')
    request(uri, options, function (error, response) {
      assert.equal(error, null)
      assert.equal(response.statusCode, 400)
      done()
    })
  })
})
