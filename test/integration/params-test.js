var assert = require('chai').assert
var supertest = require('supertest')
var path = require('path')
// Helper functions for the FS
const { rm, write, read, cleanDir } = require('../utils')

var ldnode = require('../../index')

describe('LDNODE params', function () {
  describe('suffixMeta', function () {
    describe('not passed', function () {
      it('should fallback on .meta', function () {
        var ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixMeta, '.meta')
      })
    })
  })

  describe('suffixAcl', function () {
    describe('not passed', function () {
      it('should fallback on .acl', function () {
        var ldp = ldnode({ webid: false })
        assert.equal(ldp.locals.ldp.suffixAcl, '.acl')
      })
    })
  })

  describe('root', function () {
    describe('not passed', function () {
      var ldp = ldnode({ webid: false })
      var server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.resourceMapper._rootPath, process.cwd())
      })

      it('should find resource in correct path', function (done) {
        write(
          '<#current> <#temp> 123 .',
          'sampleContainer/example.ttl')

        // This assums npm test is run from the folder that contains package.js
        server.get('/test/resources/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function (err, res, body) {
            assert.equal(read('sampleContainer/example.ttl'), '<#current> <#temp> 123 .')
            rm('sampleContainer/example.ttl')
            done(err)
          })
      })
    })

    describe('passed', function () {
      var ldp = ldnode({root: './test/resources/', webid: false})
      var server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.resourceMapper._rootPath, path.resolve('./test/resources'))
      })

      it('should find resource in correct path', function (done) {
        write(
          '<#current> <#temp> 123 .',
          'sampleContainer/example.ttl')

        // This assums npm test is run from the folder that contains package.js
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
    let rootPath = './test/resources/'
    var ldp = ldnode({
      root: rootPath,
      apiApps: path.join(__dirname, '../resources/sampleContainer'),
      webid: false
    })
    var server = supertest(ldp)

    it('should serve static files on /api/ui', (done) => {
      server.get('/api/apps/solid.png')
        .expect(200)
        .end(done)
    })
  })

  describe('forceUser', function () {
    var ldpHttpsServer

    const port = 7777
    const serverUri = `https://localhost:7777`
    const rootPath = path.join(__dirname, '../resources/accounts-acl')
    const dbPath = path.join(rootPath, 'db')
    const configPath = path.join(rootPath, 'config')

    var ldp = ldnode.createServer({
      auth: 'tls',
      forceUser: 'https://fakeaccount.com/profile#me',
      dbPath,
      configPath,
      serverUri,
      port,
      root: rootPath,
      sslKey: path.join(__dirname, '../keys/key.pem'),
      sslCert: path.join(__dirname, '../keys/cert.pem'),
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

    var server = supertest(serverUri)

    it('sets the User header', function (done) {
      server.get('/hello.html')
        .expect('User', 'https://fakeaccount.com/profile#me')
        .end(done)
    })
  })
})
