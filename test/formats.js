var supertest = require('supertest')
var ldnode = require('../index')
var path = require('path')

describe('formats', function () {
  var ldp = ldnode.createServer({
    root: path.join(__dirname, '/resources')
  })

  var server = supertest(ldp)
  describe('HTML', function () {
    it('should return HTML containing "Hello, World!" if Accept is set to text/html', function (done) {
      server.get('/hello.html')
        .set('accept', 'application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5')
        .expect('Content-type', /text\/html/)
        .expect(/Hello, world!/)
        .expect(200, done)
    })
  })

  describe('JSON-LD', function () {
    var isValidJSON = function (res) {
      // This would throw an error
      JSON.parse(res.text)
    }
    it('should return JSON-LD document if Accept is set to only application/ld+json', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/ld+json')
        .expect(200)
        .expect('content-type', /application\/ld\+json/)
        .end(done)
    })
    it('should return the container listing in JSON-LD if Accept is set to only application/ld+json', function (done) {
      server.get('/')
        .set('accept', 'application/ld+json')
        .expect(200)
        .expect('content-type', /application\/ld\+json/)
        .end(done)
    })
    it('should prefer to avoid translation even if type is listed with less priority', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/ld+json;q=0.9,text/turtle;q=0.8,text/plain;q=0.7,*/*;q=0.5')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should return JSON-LD document if Accept is set to application/ld+json and other types', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/ld+json;q=0.9,application/rdf+xml;q=0.7')
        .expect('content-type', /application\/ld\+json/)
        .expect(200, done)
    })
    it('should return valid JSON if Accept is set to JSON-LD', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/ld+json')
        .expect(isValidJSON)
        .expect(200, done)
    })
  })

  describe('N-Quads', function () {
    it('should return N-Quads document is Accept is set to application/n-quads', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/n-quads;q=0.9,application/ld+json;q=0.8,application/rdf+xml;q=0.7')
        .expect('content-type', /application\/n-quads/)
        .expect(200, done)
    })
  })

  describe('n3', function () {
    it('should return turtle document if Accept is set to text/n3', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'text/n3;q=0.9,application/n-quads;q=0.7,text/plain;q=0.7')
        .expect('content-type', /text\/n3/)
        .expect(200, done)
    })
  })

  describe('turtle', function () {
    it('should return turtle document if Accept is set to turtle', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'text/turtle;q=0.9,application/rdf+xml;q=0.8,text/plain;q=0.7,*/*;q=0.5')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })

    it('should return turtle document if Accept is set to turtle', function (done) {
      server.get('/lennon.jsonld')
        .set('accept', 'text/turtle')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })

    it('should return turtle when listing container', function (done) {
      server.get('/sampleContainer/')
        .set('accept', 'application/rdf+xml;q=0.4, application/xhtml+xml;q=0.3, text/xml;q=0.2, application/xml;q=0.2, text/html;q=0.3, text/plain;q=0.1, text/turtle;q=1.0, application/n3;q=1')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
  })

  describe('none', function () {
    it('should return turtle document if no Accept header is set', function (done) {
      server.get('/patch-5-initial.ttl')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
  })
})
