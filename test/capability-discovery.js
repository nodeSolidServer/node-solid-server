var supertest = require('supertest')
var ldnode = require('../index')
var path = require('path')
var expect = require('chai').expect

var ldpServer = ldnode.createServer({
  live: true,
  root: path.join(__dirname, '/resources')
})
var server = supertest(ldpServer)

describe('Capability Discovery', function () {
  describe('GET Service Capability document', function () {
    it('should exist', function (done) {
      server.get('/.well-known/solid')
        .expect(200, done)
    })
    it('should be a json file by default', function (done) {
      server.get('/.well-known/solid')
        .expect('content-type', /application\/json/)
        .expect(200, done)
    })
    it('includes a root element', function (done) {
      server.get('/.well-known/solid')
        .end(function (err, req) {
          expect(req.body.root).to.exist
          return done(err)
        })
    })
  })

  describe('OPTIONS API', function () {
    it('should set the service Link header',
      function (done) {
        server.options('/')
          .expect('Link', /<.*\.well-known\/solid>; rel="service"/)
          .expect(204, done)
      })
  })
})
