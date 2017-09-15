// const supertest = require('supertest')
// // Helper functions for the FS
// const $rdf = require('rdflib')
//
// const { rm, read } = require('../utils')
// const ldnode = require('../../index')
// const fs = require('fs-extra')
// const path = require('path')
//
// describe('AccountManager (TLS account creation tests)', function () {
//   var address = 'https://localhost:3457'
//   var host = 'localhost:3457'
//   var ldpHttpsServer
//   let rootPath = path.join(__dirname, '../resources/accounts/')
//   var ldp = ldnode.createServer({
//     root: rootPath,
//     sslKey: path.join(__dirname, '../keys/key.pem'),
//     sslCert: path.join(__dirname, '../keys/cert.pem'),
//     auth: 'tls',
//     webid: true,
//     multiuser: true,
//     strictOrigin: true
//   })
//
//   before(function (done) {
//     ldpHttpsServer = ldp.listen(3457, done)
//   })
//
//   after(function () {
//     if (ldpHttpsServer) ldpHttpsServer.close()
//     fs.removeSync(path.join(rootPath, 'localhost/index.html'))
//     fs.removeSync(path.join(rootPath, 'localhost/index.html.acl'))
//   })
//
//   var server = supertest(address)
//
//   it('should expect a 404 on GET /accounts', function (done) {
//     server.get('/api/accounts')
//       .expect(404, done)
//   })
//
//   describe('accessing accounts', function () {
//     it('should be able to access public file of an account', function (done) {
//       var subdomain = supertest('https://tim.' + host)
//       subdomain.get('/hello.html')
//         .expect(200, done)
//     })
//     it('should get 404 if root does not exist', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       subdomain.get('/')
//         .set('Accept', 'text/turtle')
//         .set('Origin', 'http://example.com')
//         .expect(404)
//         .expect('Access-Control-Allow-Origin', 'http://example.com')
//         .expect('Access-Control-Allow-Credentials', 'true')
//         .end(function (err, res) {
//           done(err)
//         })
//     })
//   })
//
//   describe('generating a certificate', () => {
//     beforeEach(function () {
//       rm('accounts/nicola.localhost')
//     })
//     after(function () {
//       rm('accounts/nicola.localhost')
//     })
//
//     it('should generate a certificate if spkac is valid', (done) => {
//       var spkac = read('example_spkac.cnf')
//       var subdomain = supertest.agent('https://nicola.' + host)
//       subdomain.post('/api/accounts/new')
//         .send('username=nicola&spkac=' + spkac)
//         .expect('Content-Type', /application\/x-x509-user-cert/)
//         .expect(200, done)
//     })
//
//     it('should not generate a certificate if spkac is not valid', (done) => {
//       var subdomain = supertest('https://nicola.' + host)
//       subdomain.post('/api/accounts/new')
//         .send('username=nicola')
//         .expect(200)
//         .end((err) => {
//           if (err) return done(err)
//
//           subdomain.post('/api/accounts/cert')
//             .send('username=nicola&spkac=')
//             .expect(400, done)
//         })
//     })
//   })
//
//   describe('creating an account with POST', function () {
//     beforeEach(function () {
//       rm('accounts/nicola.localhost')
//     })
//
//     after(function () {
//       rm('accounts/nicola.localhost')
//     })
//
//     it('should not create WebID if no username is given', (done) => {
//       let subdomain = supertest('https://nicola.' + host)
//       let spkac = read('example_spkac.cnf')
//       subdomain.post('/api/accounts/new')
//         .send('username=&spkac=' + spkac)
//         .expect(400, done)
//     })
//
//     it('should not create a WebID if it already exists', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       let spkac = read('example_spkac.cnf')
//       subdomain.post('/api/accounts/new')
//         .send('username=nicola&spkac=' + spkac)
//         .expect(200)
//         .end((err) => {
//           if (err) {
//             return done(err)
//           }
//           subdomain.post('/api/accounts/new')
//             .send('username=nicola&spkac=' + spkac)
//             .expect(400)
//             .end((err) => {
//               done(err)
//             })
//         })
//     })
//
//     it('should create the default folders', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       let spkac = read('example_spkac.cnf')
//       subdomain.post('/api/accounts/new')
//         .send('username=nicola&spkac=' + spkac)
//         .expect(200)
//         .end(function (err) {
//           if (err) {
//             return done(err)
//           }
//           var domain = host.split(':')[0]
//           var card = read(path.join('accounts/nicola.' + domain,
//             'profile/card'))
//           var cardAcl = read(path.join('accounts/nicola.' + domain,
//             'profile/card.acl'))
//           var prefs = read(path.join('accounts/nicola.' + domain,
//             'settings/prefs.ttl'))
//           var inboxAcl = read(path.join('accounts/nicola.' + domain,
//             'inbox/.acl'))
//           var rootMeta = read(path.join('accounts/nicola.' + domain, '.meta'))
//           var rootMetaAcl = read(path.join('accounts/nicola.' + domain,
//             '.meta.acl'))
//
//           if (domain && card && cardAcl && prefs && inboxAcl && rootMeta &&
//             rootMetaAcl) {
//             done()
//           } else {
//             done(new Error('failed to create default files'))
//           }
//         })
//     })
//
//     it('should link WebID to the root account', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       let spkac = read('example_spkac.cnf')
//       subdomain.post('/api/accounts/new')
//         .send('username=nicola&spkac=' + spkac)
//         .expect(200)
//         .end(function (err) {
//           if (err) {
//             return done(err)
//           }
//           subdomain.get('/.meta')
//             .expect(200)
//             .end(function (err, data) {
//               if (err) {
//                 return done(err)
//               }
//               var graph = $rdf.graph()
//               $rdf.parse(
//                 data.text,
//                 graph,
//                 'https://nicola.' + host + '/.meta',
//                 'text/turtle')
//               var statements = graph.statementsMatching(
//                 undefined,
//                 $rdf.sym('http://www.w3.org/ns/solid/terms#account'),
//                 undefined)
//               if (statements.length === 1) {
//                 done()
//               } else {
//                 done(new Error('missing link to WebID of account'))
//               }
//             })
//         })
//     })
//
//     it('should create a private settings container', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       subdomain.head('/settings/')
//         .expect(401)
//         .end(function (err) {
//           done(err)
//         })
//     })
//
//     it('should create a private prefs file in the settings container', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       subdomain.head('/inbox/prefs.ttl')
//         .expect(401)
//         .end(function (err) {
//           done(err)
//         })
//     })
//
//     it('should create a private inbox container', function (done) {
//       var subdomain = supertest('https://nicola.' + host)
//       subdomain.head('/inbox/')
//         .expect(401)
//         .end(function (err) {
//           done(err)
//         })
//     })
//   })
// })
