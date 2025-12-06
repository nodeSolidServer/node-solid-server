import { describe, it, before, after } from 'mocha'
import { fileURLToPath } from 'url'
import path from 'path'
import { assert } from 'chai'
import supertest from 'supertest'
import { createRequire } from 'module'

// Import utilities from ESM version
import { rm, write, read, cleanDir, getTestRoot, setTestRoot } from '../utils.mjs'

// CommonJS modules that haven't been converted yet
// const ldnode = require('../../index')
import ldnode, { createServer } from '../../index.mjs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
console.log(getTestRoot())

describe('LDNODE params', function () {
  describe('suffixMeta', function () {
    describe('not passed', function () {
      after(function () {
      // Clean up the sampleContainer directory after tests
        const fs = require('fs')
        const pathModule = require('path')
        const dirPath = pathModule.join(process.cwd(), 'sampleContainer')
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true })
        }
      })
      it('should fallback on .meta', function () {
        const ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixMeta, '.meta')
      })
    })
  })

  describe('suffixAcl', function () {
    describe('not passed', function () {
      it('should fallback on .acl', function () {
        const ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixAcl, '.acl')
      })
    })
  })

  describe('root', function () {
    describe('not passed', function () {
      const ldp = ldnode({ webid: false })
      const server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(path.normalize(ldp.locals.ldp.resourceMapper._rootPath), path.normalize(process.cwd()))
        console.log('Root path is', ldp.locals.ldp.resourceMapper._rootPath)
      })

      it('new : should find resource in correct path', function (done) {
        const fs = require('fs')
        const pathModule = require('path')
        const dirPath = pathModule.join(process.cwd(), 'sampleContainer')
        const ldp = require('../../index.js')({ dirPath, webid: false })
        const server = require('supertest')(ldp)
        const filePath = pathModule.join(dirPath, 'example.ttl')
        const fileContent = '<#current> <#temp> 123 .'
        fs.mkdirSync(dirPath, { recursive: true })
        fs.writeFileSync(filePath, fileContent)
        console.log('Wrote file to', filePath)
        server.get('/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(fs.readFileSync(filePath, 'utf8'), fileContent)
            fs.unlinkSync(filePath)
            done(err)
          })
      })

      it.skip('initial : should find resource in correct path', function (done) {
        // Write to the default resources directory, matching the server's root
        const resourcePath = path.join('sampleContainer', 'example.ttl')
        console.log('initial : Writing test resource to', resourcePath)
        setTestRoot(path.join(__dirname, '../../test-esm/resources/'))
        write('<#current> <#temp> 123 .', resourcePath)

        server.get('/test-esm/resources/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(read(resourcePath), '<#current> <#temp> 123 .')
            rm(resourcePath)
            done(err)
          })
      })
    })

    describe('passed', function () {
      const ldp = ldnode({ root: './test-esm/resources/', webid: false })
      const server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(path.normalize(ldp.locals.ldp.resourceMapper._rootPath), path.normalize(path.resolve('./test-esm/resources')))
      })

      it('new : should find resource in correct path', function (done) {
        const fs = require('fs')
        const pathModule = require('path')
        const ldp = require('../../index.js')({ root: './test-esm/resources/', webid: false })
        const server = require('supertest')(ldp)
        const dirPath = pathModule.join(__dirname, '../resources/sampleContainer')
        const filePath = pathModule.join(dirPath, 'example.ttl')
        const fileContent = '<#current> <#temp> 123 .'
        fs.mkdirSync(dirPath, { recursive: true })
        fs.writeFileSync(filePath, fileContent)
        console.log('Wrote file to', filePath)

        server.get('/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(fs.readFileSync(filePath, 'utf8'), fileContent)
            fs.unlinkSync(filePath)
            done(err)
          })
      })

      it.skip('initial :should find resource in correct path', function (done) {
        write(
          '<#current> <#temp> 123 .',
          '/sampleContainer/example.ttl')

        // This assumes npm test is run from the folder that contains package.js
        server.get('/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(read('sampleContainer/example.ttl'), '<#current> <#temp> 123 .')
            rm('sampleContainer/example.ttl')
            done(err)
          })
      })
    })
  })

  describe('ui-path', function () {
    const rootPath = './test-esm/resources/'
    const ldp = ldnode({
      root: rootPath,
      apiApps: path.join(__dirname, '../../test-esm/resources/sampleContainer'),
      webid: false
    })
    const server = supertest(ldp)

    it('should serve static files on /api/ui', (done) => {
      server.get('/api/apps/solid.png')
        .expect(200)
        .end(done)
    })
  })

  describe('forceUser', function () {
    let ldpHttpsServer

    const port = 7777
    const serverUri = 'https://localhost:7777'
    const rootPath = path.join(__dirname, '../../test-esm/resources/accounts-acl')
    const dbPath = path.join(rootPath, 'db')
    const configPath = path.join(rootPath, 'config')

    const ldp = createServer({
      auth: 'tls',
      forceUser: 'https://fakeaccount.com/profile#me',
      dbPath,
      configPath,
      serverUri,
      port,
      root: rootPath,
      sslKey: path.join(__dirname, '../../test/keys/key.pem'),
      sslCert: path.join(__dirname, '../../test/keys/cert.pem'),
      webid: true,
      host: 'localhost:3457',
      rejectUnauthorized: false
    })

    before(function (done) {
      ldpHttpsServer = ldp.listen(port, done)
    })

    after(function () {
      if (ldpHttpsServer) ldpHttpsServer.close()
      cleanDir(rootPath)
    })

    const server = supertest(serverUri)

    it('sets the User header', function (done) {
      server.get('/hello.html')
        .expect('User', 'https://fakeaccount.com/profile#me')
        .end(done)
    })
  })
})
