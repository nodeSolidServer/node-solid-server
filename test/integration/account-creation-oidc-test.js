const supertest = require('supertest')
// Helper functions for the FS
const $rdf = require('rdflib')

const { rm, read, checkDnsSettings, cleanDir } = require('../utils')
const ldnode = require('../../index')
const path = require('path')
const fs = require('fs-extra')

describe('AccountManager (OIDC account creation tests)', function () {
  const port = 3457
  const serverUri = `https://localhost:${port}`
  const host = `localhost:${port}`
  const root = path.join(__dirname, '../resources/accounts/')
  const configPath = path.join(__dirname, '../resources/config')
  const dbPath = path.join(__dirname, '../resources/accounts/db')

  let ldpHttpsServer

  var ldp = ldnode.createServer({
    root,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    multiuser: true,
    strictOrigin: true,
    dbPath,
    serverUri,
    enforceToc: true
  })

  before(checkDnsSettings)

  before(function (done) {
    ldpHttpsServer = ldp.listen(port, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(dbPath, 'oidc/users/users'))
    cleanDir(path.join(root, 'localhost'))
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
      let subdomain = supertest('https://' + host)
      subdomain.post('/api/accounts/new')
        .send('username=&password=12345')
        .expect(400, done)
    })

    it('should not create WebID if no password is given', (done) => {
      let subdomain = supertest('https://' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=')
        .expect(400, done)
    })

    it('should not create a WebID if it already exists', function (done) {
      var subdomain = supertest('https://' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345&acceptToc=true')
        .expect(302)
        .end((err, res) => {
          if (err) {
            return done(err)
          }
          subdomain.post('/api/accounts/new')
            .send('username=nicola&password=12345&acceptToc=true')
            .expect(400)
            .end((err) => {
              done(err)
            })
        })
    })

    it('should not create WebID if T&C is not accepted', (done) => {
      let subdomain = supertest('https://' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345&acceptToc=')
        .expect(400, done)
    })

    it('should create the default folders', function (done) {
      var subdomain = supertest('https://' + host)
      subdomain.post('/api/accounts/new')
        .send('username=nicola&password=12345&acceptToc=true')
        .expect(302)
        .end(function (err) {
          if (err) {
            return done(err)
          }
          var domain = host.split(':')[0]
          var card = read(path.join('accounts/nicola.' + domain,
            'profile/card$.ttl'))
          var cardAcl = read(path.join('accounts/nicola.' + domain,
           'profile/.acl'))
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
      const domain = supertest('https://' + host)
      domain.post('/api/accounts/new')
        .send('username=nicola&password=12345&acceptToc=true')
        .expect(302)
        .end(function (err) {
          if (err) {
            return done(err)
          }
          const subdomain = supertest('https://nicola.' + host)
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

    describe('after setting up account', () => {
      beforeEach(done => {
        var subdomain = supertest('https://' + host)
        subdomain.post('/api/accounts/new')
          .send('username=nicola&password=12345&acceptToc=true')
          .end(done)
      })

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
})

describe('Single User signup page', () => {
  const serverUri = 'https://localhost:7457'
  const port = 7457
  let ldpHttpsServer
  const rootDir = path.join(__dirname, '../resources/accounts/single-user/')
  const configPath = path.join(__dirname, '../resources/config')
  const ldp = ldnode.createServer({
    port,
    root: rootDir,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    webid: true,
    multiuser: false,
    strictOrigin: true
  })
  const server = supertest(serverUri)

  before(function (done) {
    ldpHttpsServer = ldp.listen(port, () => server.post('/api/accounts/new')
      .send('username=foo&password=12345&acceptToc=true')
      .end(done))
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(rootDir)
  })

  it.skip('should return a 406 not acceptable without accept text/html', done => {
    server.get('/')
      .set('accept', 'text/plain')
      .expect(406)
      .end(done)
  })
})

describe('Signup page where Terms & Conditions are not being enforced', () => {
  const port = 3457
  const host = `localhost:${port}`
  const root = path.join(__dirname, '../resources/accounts/')
  const configPath = path.join(__dirname, '../resources/config')
  const dbPath = path.join(__dirname, '../resources/accounts/db')
  const ldp = ldnode.createServer({
    port,
    root,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    webid: true,
    multiuser: true,
    strictOrigin: true,
    enforceToc: false
  })
  let ldpHttpsServer

  before(function (done) {
    ldpHttpsServer = ldp.listen(port, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(dbPath, 'oidc/users/users'))
    cleanDir(path.join(root, 'localhost'))
    rm('accounts/nicola.localhost')
  })

  beforeEach(function () {
    rm('accounts/nicola.localhost')
  })

  it('should not enforce T&C upon creating account', function (done) {
    var subdomain = supertest('https://' + host)
    subdomain.post('/api/accounts/new')
      .send('username=nicola&password=12345')
      .expect(302, done)
  })
})
