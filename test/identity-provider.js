var supertest = require('supertest')
// Helper functions for the FS
var rm = require('./test-utils').rm
// var write = require('./test-utils').write
// var cp = require('./test-utils').cp
var read = require('./test-utils').read
var ldnode = require('../index')

describe('Identity Provider', function () {
  this.timeout(10000)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  var address = 'https://localhost:3457'
  var host = 'localhost:3457'
  var ldpHttpsServer
  var ldp = ldnode.createServer({
    root: __dirname + '/resources/accounts/',
    key: __dirname + '/keys/key.pem',
    cert: __dirname + '/keys/cert.pem',
    webid: true,
    idp: true
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3457, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
  })

  var server = supertest(address)

  it('should redirect to signup on GET /accounts', function (done) {
    server.get('/accounts')
      .expect(302, done)
  })

  describe('accessing accounts', function () {
    it('should be able to access public file of an account', function (done) {
      var subdomain = supertest('https://tim.' + host)
      subdomain.get('/hello.html')
        .expect(200, done)
    })
  })

  describe('generating a certificate', function () {
    beforeEach(function () {
      rm('accounts/nicola.localhost')
    })
    after(function () {
      rm('accounts/nicola.localhost')
    })

    it('should generate a certificate if spkac is valid', function (done) {
      var spkac = read('example_spkac.cnf')
      var subdomain = supertest.agent('https://nicola.' + host)
      subdomain.post('/accounts/new')
        .send('username=nicola')
        .expect(200)
        .end(function (err, req) {
          if (err) return done(err)

          subdomain.post('/accounts/cert')
            .send('spkac=' + spkac + '&webid=https%3A%2F%2Fnicola.localhost%3A3457%2Fprofile%2Fcard%23me')
            .expect('Content-Type', /application\/x-x509-user-cert/)
            .expect(200)
            .end(done)
        })
    })

    it('should not generate a certificate if spkac is not valid', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/accounts/new')
        .send('username=nicola')
        .expect(200)
        .end(function (err) {
          if (err) return done(err)

          var spkac = ''
          subdomain.post('/accounts/cert')
            .send('webid=https://nicola.' + host + '/profile/card#me&spkac=' + spkac)
            .expect(500, done)
        })
    })
  })

  describe('creating an account with POST', function () {
    beforeEach(function () {
      rm('accounts/nicola.localhost')
    })

    after(function () {
      rm('accounts/nicola.localhost')
    })

    it('should return 406 if username is not given', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/accounts/new')
        .expect(406, done)
    })
    it('should return create WebID if only username is given', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/accounts/new')
        .send('username=nicola')
        .expect(200)
        .end(function (err) {
          done(err)
        })
    })

    it('should not create a WebID if it already exists', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/accounts/new')
        .send('username=nicola')
        .expect(200)
        .end(function (err) {
          if (err) {
            return done(err)
          }
          subdomain.post('/accounts/new')
            .send('username=nicola')
            .expect(406)
            .end(function (err) {
              done(err)
            })
        })
    })
  })
})
