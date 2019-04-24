const supertest = require('supertest')
const ldnode = require('../../index')
const path = require('path')
const { cleanDir, cp } = require('../utils')
const expect = require('chai').expect

describe('OIDC error handling', function () {
  const serverUri = 'https://localhost:3457'
  var ldpHttpsServer
  const rootPath = path.join(__dirname, '../resources/accounts/errortests')
  const configPath = path.join(__dirname, '../resources/config')
  const dbPath = path.join(__dirname, '../resources/accounts/db')

  const ldp = ldnode.createServer({
    root: rootPath,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    multiuser: false,
    strictOrigin: true,
    dbPath,
    serverUri
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3457, () => {
      cp(path.join('accounts/errortests', '.acl-override'), path.join('accounts/errortests', '.acl'))
      done()
    })
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    cleanDir(rootPath)
  })

  const server = supertest(serverUri)

  describe('Unauthenticated requests to protected resources', () => {
    describe('accepting text/html', () => {
      it('should return 401 Unauthorized with www-auth header', () => {
        return server.get('/profile/')
          .set('Accept', 'text/html')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid webid"')
          .expect(401)
      })

      it('should return an html login page', () => {
        return server.get('/profile/')
          .set('Accept', 'text/html')
          .expect('Content-Type', 'text/html; charset=utf-8')
          .then(res => {
            expect(res.text).to.match(/Log in/)
          })
      })
    })

    describe('not accepting html', () => {
      it('should return 401 Unauthorized with www-auth header', () => {
        return server.get('/profile/')
          .set('Accept', 'text/plain')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid webid"')
          .expect(401)
      })
    })
  })

  describe('Authenticated responses to protected resources', () => {
    describe('with an empty bearer token', () => {
      it('should return a 400 error', () => {
        return server.get('/profile/')
          .set('Authorization', 'Bearer ')
          .expect(400)
      })
    })

    describe('with an invalid bearer token', () => {
      it('should return a 401 error', () => {
        return server.get('/profile/')
          .set('Authorization', 'Bearer abcd123')
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid webid", error="invalid_token", error_description="Access token is not a JWT"')
          .expect(401)
      })
    })

    describe('with an expired bearer token', () => {
      const expiredToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImxOWk9CLURQRTFrIn0.eyJpc3MiOiJodHRwczovL2xvY2FsaG9zdDozNDU3Iiwic3ViIjoiaHR0cHM6Ly9sb2NhbGhvc3Q6MzQ1Ny9wcm9maWxlL2NhcmQjbWUiLCJhdWQiOiJodHRwczovL2xvY2FsaG9zdDozNDU3IiwiZXhwIjoxNDk2MjM5ODY1LCJpYXQiOjE0OTYyMzk4NjUsImp0aSI6IjliN2MwNGQyNDY3MjQ1ZWEiLCJub25jZSI6IklXaUpMVFNZUmktVklSSlhjejVGdU9CQTFZR1lZNjFnRGRlX2JnTEVPMDAiLCJhdF9oYXNoIjoiRFpES3I0RU1xTGE1Q0x1elV1WW9pdyJ9.uBTLy_wG5rr4kxM0hjXwIC-NwGYrGiiiY9IdOk5hEjLj2ECc767RU7iZ5vZa0pSrGy0V2Y3BiZ7lnYIA7N4YUAuS077g_4zavoFWyu9xeq6h70R8yfgFUNPo91PGpODC9hgiNbEv2dPBzTYYHqf7D6_-3HGnnDwiX7TjWLTkPLRvPLTcsCUl7G7y-EedjcVRk3Jyv8TNSoBMeTwOR3ewuzNostmCjUuLsr73YpVid6HE55BBqgSCDCNtS-I7nYmO_lRqIWJCydjdStSMJgxzSpASvoeCJ_lwZF6FXmZOQNNhmstw69fU85J1_QsS78cRa76-SnJJp6JCWHFBUAolPQ'

      it('should return a 401 error', () => {
        return server.get('/profile/')
          .set('Authorization', 'Bearer ' + expiredToken)
          .expect('WWW-Authenticate', 'Bearer realm="https://localhost:3457", scope="openid webid", error="invalid_token", error_description="Access token is expired"')
          .expect(401)
      })

      it('should return a 200 if the resource is public', () => {
        return server.get('/public/')
          .set('Authorization', 'Bearer ' + expiredToken)
          .expect(200)
      })
    })
  })
})
