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
    nock('https://example.org').get('/').reply(200)
    server.get('/proxy?uri=https://example.org/')
      .expect(200, done)
  })

  it('should pass the Host header to the proxied server', (done) => {
    let headers
    nock('https://example.org').get('/').reply(function (uri, body) {
      headers = this.req.headers
      return 200
    })
    server.get('/proxy?uri=https://example.org/')
      .expect(200)
      .end(error => {
        assert.propertyVal(headers, 'host', 'example.org')
        done(error)
      })
  })

  it('should return 400 when the uri parameter is missing', (done) => {
    nock('https://192.168.0.0').get('/').reply(200)
    server.get('/proxy')
      .expect('Invalid URL passed: (none)')
      .expect(400)
      .end(done)
  })

  const LOCAL_IPS = ['127.0.0.0', '10.0.0.0', '172.16.0.0', '192.168.0.0']
  LOCAL_IPS.forEach(ip => {
    it(`should return 400 for a ${ip} address`, (done) => {
      nock(`https://${ip}`).get('/').reply(200)
      server.get(`/proxy?uri=https://${ip}/`)
        .expect(`Cannot proxy https://${ip}/`)
        .expect(400)
        .end(done)
    })
  })

  it('should return 400 with a local hostname', (done) => {
    nock('https://nic.localhost').get('/').reply(200)
    server.get('/proxy?uri=https://nic.localhost/')
      .expect('Cannot proxy https://nic.localhost/')
      .expect(400)
      .end(done)
  })

  it('should return 400 on invalid uri', (done) => {
    server.get('/proxy?uri=HELLOWORLD')
      .expect('Invalid URL passed: HELLOWORLD')
      .expect(400)
      .end(done)
  })

  it('should return 400 on relative paths', (done) => {
    server.get('/proxy?uri=../')
      .expect('Invalid URL passed: ../')
      .expect(400)
      .end(done)
  })

  it('should return the same headers of proxied request', (done) => {
    nock('https://example.org')
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

    server.get('/proxy?uri=https://example.org/')
      .set('test', 'test1')
      .set('accept', 'text/turtle')
      .expect(200)
      .end((err, data) => {
        if (err) return done(err)
        done(err)
      })
  })

  it('should also work on /proxy/ ?uri', (done) => {
    nock('https://example.org').get('/').reply(200)
    server.get('/proxy/?uri=https://example.org/')
      .expect((a) => {
        assert.equal(a.header['link'], null)
      })
      .expect(200, done)
  })

  it('should return the same HTTP status code as the uri', (done) => {
    async.parallel([
      // 500
      (next) => {
        nock('https://example.org').get('/404').reply(404)
        server.get('/proxy/?uri=https://example.org/404')
          .expect(404, next)
      },
      (next) => {
        nock('https://example.org').get('/401').reply(401)
        server.get('/proxy/?uri=https://example.org/401')
          .expect(401, next)
      },
      (next) => {
        nock('https://example.org').get('/500').reply(500)
        server.get('/proxy/?uri=https://example.org/500')
          .expect(500, next)
      },
      (next) => {
        nock('https://example.org').get('/').reply(200)
        server.get('/proxy/?uri=https://example.org/')
          .expect(200, next)
      }
    ], done)
  })

  it('should work with cors', (done) => {
    nock('https://example.org').get('/').reply(200)
    server.get('/proxy/?uri=https://example.org/')
      .set('Origin', 'http://example.com')
      .expect('Access-Control-Allow-Origin', 'http://example.com')
      .expect(200, done)
  })
})
