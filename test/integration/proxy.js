var assert = require('chai').assert
var supertest = require('supertest')
var path = require('path')
var nock = require('nock')
var async = require('async')

var ldnode = require('../../index')

describe('proxy', () => {
  var ldp = ldnode({
    root: path.join(__dirname, '../resources'),
    proxy: '/proxy',
    webid: false
  })
  var server = supertest(ldp)

  it('should return the website in /proxy?uri', (done) => {
    nock('https://amazingwebsite.tld').get('/').reply(200)
    server.get('/proxy?uri=https://amazingwebsite.tld/')
      .expect(200, done)
  })

  it('should return error on local network requests', (done) => {
    nock('https://192.168.0.0').get('/').reply(200)
    server.get('/proxy?uri=https://192.168.0.0/')
      .expect(406, done)
  })

  it('should return error on invalid uri', (done) => {
    server.get('/proxy?uri=HELLOWORLD')
      .expect(406, done)
  })

  it('should return error on relative paths', (done) => {
    server.get('/proxy?uri=../')
      .expect(406, done)
  })

  it('should return the same headers of proxied request', (done) => {
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
      .end((err, data) => {
        if (err) return done(err)
        done(err)
      })
  })

  it('should also work on /proxy/ ?uri', (done) => {
    nock('https://amazingwebsite.tld').get('/').reply(200)
    server.get('/proxy/?uri=https://amazingwebsite.tld/')
      .expect((a) => {
        assert.equal(a.header['link'], null)
      })
      .expect(200, done)
  })

  it('should return the same HTTP status code as the uri', (done) => {
    async.parallel([
      // 500
      (next) => {
        nock('https://amazingwebsite.tld').get('/404').reply(404)
        server.get('/proxy/?uri=https://amazingwebsite.tld/404')
          .expect(404, next)
      },
      (next) => {
        nock('https://amazingwebsite.tld').get('/401').reply(401)
        server.get('/proxy/?uri=https://amazingwebsite.tld/401')
          .expect(401, next)
      },
      (next) => {
        nock('https://amazingwebsite.tld').get('/500').reply(500)
        server.get('/proxy/?uri=https://amazingwebsite.tld/500')
          .expect(500, next)
      },
      (next) => {
        nock('https://amazingwebsite.tld').get('/').reply(200)
        server.get('/proxy/?uri=https://amazingwebsite.tld/')
          .expect(200, next)
      }
    ], done)
  })

  it('should work with cors', (done) => {
    nock('https://amazingwebsite.tld').get('/').reply(200)
    server.get('/proxy/?uri=https://amazingwebsite.tld/')
      .set('Origin', 'http://example.com')
      .expect('Access-Control-Allow-Origin', 'http://example.com')
      .expect(200, done)
  })
})
