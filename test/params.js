var assert = require('chai').assert
var supertest = require('supertest')
var nock = require('nock')
var async = require('async')
var path = require('path')
// Helper functions for the FS
var rm = require('./test-utils').rm
var write = require('./test-utils').write
// var cp = require('./test-utils').cp
var read = require('./test-utils').read

var ldnode = require('../index')

describe('LDNODE params', function () {
  describe('proxy', function () {
    var ldp = ldnode({
      root: path.join(__dirname, '/resources'),
      proxy: '/proxy'
    })
    var server = supertest(ldp)

    it('should return the website in /proxy?uri', function (done) {
      nock('https://amazingwebsite.tld').get('/').reply(200)
      server.get('/proxy?uri=https://amazingwebsite.tld/')
        .expect(200, done)
    })

    it('should return local network requests', function (done) {
      nock('https://192.168.0.0').get('/').reply(200)
      server.get('/proxy?uri=https://192.168.0.0/')
        .expect(406, done)
    })

    it('should return error on invalid uri', function (done) {
      server.get('/proxy?uri=HELLOWORLD')
        .expect(406, done)
    })

    it('should return error on relative paths', function (done) {
      server.get('/proxy?uri=../')
        .expect(406, done)
    })

    it('should return the same headers of proxied request', function (done) {
      nock('https://amazingwebsite.tld')
        .get('/')
        .reply(function (uri, req) {
          if (this.req.headers['accept'] !== 'text/turtle') {
            throw Error('Accept is received on the header')
          }
          if (this.req.headers['test'] && this.req.headers['test'] === 'test1') {
            return [200, 'YES']
          } else {
            return [500, 'empty']
          }
        })

      server.get('/proxy?uri=https://amazingwebsite.tld/')
        .set('test', 'test1')
        .set('accept', 'text/turtle')
        .expect(200)
        .end(function (err, data) {
          if (err) return done(err)
          done(err)
        })
    })

    it('should also work on /proxy/ ?uri', function (done) {
      nock('https://amazingwebsite.tld').get('/').reply(200)
      server.get('/proxy/?uri=https://amazingwebsite.tld/')
        .expect(function (a) {
          assert.equal(a.header['link'], null)
        })
        .expect(200, done)
    })

    it('should return the same HTTP status code as the uri', function (done) {
      async.parallel([
        // 500
        function (next) {
          nock('https://amazingwebsite.tld').get('/404').reply(404)
          server.get('/proxy/?uri=https://amazingwebsite.tld/404')
            .expect(404, next)
        },
        function (next) {
          nock('https://amazingwebsite.tld').get('/401').reply(401)
          server.get('/proxy/?uri=https://amazingwebsite.tld/401')
            .expect(401, next)
        },
        function (next) {
          nock('https://amazingwebsite.tld').get('/500').reply(500)
          server.get('/proxy/?uri=https://amazingwebsite.tld/500')
            .expect(500, next)
        },
        function (next) {
          nock('https://amazingwebsite.tld').get('/').reply(200)
          server.get('/proxy/?uri=https://amazingwebsite.tld/')
            .expect(200, next)
        }
      ], done)
    })

    it('should work with cors', function (done) {
      nock('https://amazingwebsite.tld').get('/').reply(200)
      server.get('/proxy/?uri=https://amazingwebsite.tld/')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })
  })

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
