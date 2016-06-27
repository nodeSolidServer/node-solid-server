var assert = require('chai').assert
var supertest = require('supertest')
var path = require('path')
// Helper functions for the FS
var rm = require('./test-utils').rm
var write = require('./test-utils').write
// var cp = require('./test-utils').cp
var read = require('./test-utils').read

var ldnode = require('../index')

describe('LDNODE params', function () {
  describe('suffixMeta', function () {
    describe('not passed', function () {
      it('should fallback on .meta', function () {
        var ldp = ldnode()
        assert.equal(ldp.locals.ldp.suffixMeta, '.meta')
      })
    })
  })

  describe('suffixAcl', function () {
    describe('not passed', function () {
      it('should fallback on .acl', function () {
        var ldp = ldnode()
        assert.equal(ldp.locals.ldp.suffixAcl, '.acl')
      })
    })
  })

  describe('root', function () {
    describe('not passed', function () {
      var ldp = ldnode()
      var server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.root, process.cwd() + '/')
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
      var ldp = ldnode({root: './test/resources/'})
      var server = supertest(ldp)

      it('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.root, './test/resources/')
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
    var ldp = ldnode({
      root: './test/resources/',
      apiApps: path.join(__dirname, 'resources/sampleContainer')
    })
    var server = supertest(ldp)

    it('should serve static files on /api/ui', (done) => {
      server.get('/api/apps/solid.png')
        .expect(200)
        .end(done)
    })
  })

  describe('forcedUser', function () {
    var ldpHttpsServer
    var ldp = ldnode.createServer({
      forceUser: 'https://fakeaccount.com/profile#me',
      root: path.join(__dirname, '/resources/acl/fake-account'),
      sslKey: path.join(__dirname, '/keys/key.pem'),
      sslCert: path.join(__dirname, '/keys/cert.pem'),
      webid: true,
      host: 'localhost:3457'
    })

    before(function (done) {
      ldpHttpsServer = ldp.listen(3459, done)
    })

    after(function () {
      if (ldpHttpsServer) ldpHttpsServer.close()
    })

    var server = supertest('https://localhost:3459')

    it('should find resource in correct path', function (done) {
      server.get('/hello.html')
        .expect('User', 'https://fakeaccount.com/profile#me')
        .end(done)
    })
  })
})
