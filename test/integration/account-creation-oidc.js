const supertest = require('supertest')
// Helper functions for the FS
const $rdf = require('rdflib')

const { rm, read } = require('../test-utils')
const ldnode = require('../../index')
const path = require('path')
const fs = require('fs-extra')

describe('AccountManager (OIDC account creation tests)', function () {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  var serverUri = 'https://localhost:3457'
  var host = 'localhost:3457'
  var ldpHttpsServer
  let dbPath = path.join(__dirname, '../resources/accounts/db')

  var ldp = ldnode.createServer({
    root: path.join(__dirname, '../resources/accounts/'),
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    idp: true,
    strictOrigin: true,
    dbPath,
    serverUri
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3457, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(dbPath, 'oidc/users/users'))
  })

  var server = supertest(serverUri)

  it('should expect a 404 on GET /accounts', function (done) {
    server.get('/api/accounts')
      .expect(404, done)
  })

  describe('accessing accounts', function () {
    it('should be able to access public file of an account', function (done) {
      var subdomain = supertest('https://tim.' + host)
      subdomain.get('/hello.html')
        .expect(200, done)
    })
    it('should get 404 if root does not exist', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.get('/')
        .set('Accept', 'text/turtle')
        .set('Origin', 'http://example.com')
        .expect(404)
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect('Access-Control-Allow-Credentials', 'true')
        .end(function (err, res) {
          done(err)
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

    it('should not create WebID if no username is given', (done) => {
      let subdomain = supertest('https://nicola.' + host)
      subdomain.post('/api/accounts/new')
        .send('username=&password=12345')
        .expect(400, done)
    })

    it('should not create WebID if no password is given', (done) => {
      let subdomain = supertest('https://nicola.' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=')
        .expect(400, done)
    })

    it('should not create a WebID if it already exists', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(201)
        .end((err, res) => {
          if (err) {
            return done(err)
          }
          subdomain.post('/api/accounts/new')
            .send('username=nicola&password=12345')
            .expect(400)
            .end((err) => {
              done(err)
            })
        })
    }).timeout(20000)

    it('should create the default folders', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(201)
        .end(function (err) {
          if (err) {
            return done(err)
          }
          var domain = host.split(':')[0]
          var card = read(path.join('accounts/nicola.' + domain,
           'profile/card'))
          var cardAcl = read(path.join('accounts/nicola.' + domain,
           'profile/card.acl'))
          var prefs = read(path.join('accounts/nicola.' + domain,
           'settings/prefs.ttl'))
          var inboxAcl = read(path.join('accounts/nicola.' + domain,
           'inbox/.acl'))
          var rootMeta = read(path.join('accounts/nicola.' + domain, '.meta'))
          var rootMetaAcl = read(path.join('accounts/nicola.' + domain,
           '.meta.acl'))

          if (domain && card && cardAcl && prefs && inboxAcl && rootMeta &&
             rootMetaAcl) {
            done()
          } else {
            done(new Error('failed to create default files'))
          }
        })
    }).timeout(20000)

    it('should link WebID to the root account', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345')
        .expect(201)
        .end(function (err) {
          if (err) {
            return done(err)
          }
          subdomain.get('/.meta')
            .expect(200)
            .end(function (err, data) {
              if (err) {
                return done(err)
              }
              var graph = $rdf.graph()
              $rdf.parse(
                data.text,
                graph,
                'https://nicola.' + host + '/.meta',
                'text/turtle')
              var statements = graph.statementsMatching(
                undefined,
                $rdf.sym('http://www.w3.org/ns/solid/terms#account'),
                undefined)
              if (statements.length === 1) {
                done()
              } else {
                done(new Error('missing link to WebID of account'))
              }
            })
        })
    }).timeout(20000)

    it('should create a private settings container', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.head('/settings/')
        .expect(401)
        .end(function (err) {
          done(err)
        })
    })

    it('should create a private prefs file in the settings container', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.head('/inbox/prefs.ttl')
        .expect(401)
        .end(function (err) {
          done(err)
        })
    })

    it('should create a private inbox container', function (done) {
      var subdomain = supertest('https://nicola.' + host)
      subdomain.head('/inbox/')
        .expect(401)
        .end(function (err) {
          done(err)
        })
    })
  })
})
