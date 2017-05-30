const supertest = require('supertest')
const ldnode = require('../../index')
const path = require('path')
const fs = require('fs-extra')
const expect = require('chai').expect

describe('OIDC error handling', function () {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  const serverUri = 'https://localhost:3457'
  var ldpHttpsServer
  const rootPath = path.join(__dirname, '../resources/accounts/errortests')
  const dbPath = path.join(__dirname, '../resources/accounts/db')

  const ldp = ldnode.createServer({
    root: rootPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    idp: false,
    strictOrigin: true,
    dbPath,
    serverUri
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3457, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(rootPath, 'index.html'))
    fs.removeSync(path.join(rootPath, 'index.html.acl'))
  })

  const server = supertest(serverUri)

  describe('Unauthenticated requests to protected resources', () => {
    describe('accepting json only', () => {
      it('should return 401 Unauthorized with www-auth header', done => {
        server.get('/profile/')
          .set('Accept', 'application/json')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid"')
          .expect(401, done)
      })

      it('should return json body', done => {
        server.get('/profile/')
          .set('Accept', 'application/json')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(res => {
            let json = JSON.parse(res.text)
            expect(json).to.eql({
              realm: 'https://localhost:3457', scope: 'openid'
            })
          })
          .end(done)
      })
    })

    describe('accepting text/html', () => {
      it('should return 401 Unauthorized with www-auth header', done => {
        server.get('/profile/')
          .set('Accept', 'text/html')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid"')
          .expect(401, done)
      })

      it('should return an html redirect body', done => {
        server.get('/profile/')
          .set('Accept', 'text/html')
          .expect('Content-Type', 'text/html; charset=utf-8')
          .expect(res => {
            expect(res.text).to.match(/<meta http-equiv="refresh"/)
          })
          .end(done)
      })
    })
  })

  describe('Authenticated responses to protected resources', () => {
    describe('with an empty bearer token', () => {
      it('should return a 401 error', done => {
        server.get('/profile/')
          .set('Accept', 'application/json')
          .set('Authorization', 'Bearer ')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid"')
          .expect(401)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(res => {
            let json = JSON.parse(res.text)
            expect(json).to.eql({
              realm: 'https://localhost:3457', scope: 'openid'
            })
          })
          .end(done)
      })
    })

    describe('with an invalid bearer token', () => {
      it('should return a 401 error', done => {
        server.get('/profile/')
          .set('Accept', 'application/json')
          .set('Authorization', 'Bearer abcd123')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid", error="invalid_token", error_description="Access token is not a JWT"')
          .expect(401)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(res => {
            let json = JSON.parse(res.text)
            expect(json).to.eql({
              realm: 'https://localhost:3457',
              scope: 'openid',
              error: 'invalid_token',
              error_description: 'Access token is not a JWT'
            })
          })
          .end(done)
      })
    })
  })
})
