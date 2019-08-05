var path = require('path')
const assert = require('chai').assert
const { setupSupertestServer } = require('../utils')

describe('formats', function () {
  const server = setupSupertestServer({
    root: path.join(__dirname, '../resources'),
    webid: false
  })

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
    function isCorrectSubject (idFragment) {
      return (res) => {
        var payload = JSON.parse(res.text)
        var id = payload[0]['@id']
        assert(id.endsWith(idFragment), 'The subject of the JSON-LD graph is correct')
      }
    }
    function isValidJSON (res) {
      // This would throw an error
      JSON.parse(res.text)
    }
    it('should return JSON-LD document if Accept is set to only application/ld+json', function (done) {
      server.get('/patch-5-initial.ttl')
        .set('accept', 'application/ld+json')
        .expect(200)
        .expect('content-type', /application\/ld\+json/)
        .expect(isValidJSON)
        .expect(isCorrectSubject('/patch-5-initial.ttl#Iss1408851516666'))
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

    it('should return turtle when listing container with an index page', function (done) {
      server.get('/sampleContainer/')
        .set('accept', 'application/rdf+xml;q=0.4, application/xhtml+xml;q=0.3, text/xml;q=0.2, application/xml;q=0.2, text/html;q=0.3, text/plain;q=0.1, text/turtle;q=1.0, application/n3;q=1')
        .expect('content-type', /text\/html/)
        .expect(200, done)
    })

    it('should return turtle when listing container without an index page', function (done) {
      server.get('/sampleContainer2/')
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
