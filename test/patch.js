var ldnode = require('../')
var supertest = require('supertest')
var assert = require('chai').assert
var path = require('path')

// Helper functions for the FS
var rm = require('./test-utils').rm
var write = require('./test-utils').write
// var cp = require('./test-utils').cp
var read = require('./test-utils').read

describe('PATCH', function () {
  // Starting LDP
  var ldp = ldnode({
    root: path.join(__dirname, '/resources/sampleContainer'),
    mount: '/test'
  })
  var server = supertest(ldp)

  it('should create a new file if file does not exist', function (done) {
    rm('sampleContainer/notExisting.ttl')
    server.patch('/notExisting.ttl')
      .set('content-type', 'application/sparql-update')
      .send('INSERT DATA { :test  :hello 456 .}')
      .expect(200)
      .end(function (err, res, body) {
        assert.equal(
          read('sampleContainer/notExisting.ttl'),
          '\n   <#test> <#hello> 456 .\n')
        rm('sampleContainer/notExisting.ttl')
        done(err)
      })
  })

  describe('DELETE', function () {
    it('should be an empty resource if last triple is deleted', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/existingTriple.ttl')
      server.post('/existingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('DELETE { :current  :temp 123 .}')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/existingTriple.ttl'),
            '\n')
          rm('sampleContainer/existingTriple.ttl')
          done(err)
        })
    })
  })

  describe('DELETE and INSERT', function () {
    it('should be update a resource using SPARQL-query using `prefix`', function (done) {
      write(
        '@prefix schema: <http://schema.org/> .\n' +
        '@prefix profile: <http://ogp.me/ns/profile#> .\n' +
        '# <http://example.com/timbl#> a schema:Person ;\n' +
        '<#> a schema:Person ;\n' +
        '  profile:first_name "Tim" .\n',
        'sampleContainer/prefixSparql.ttl')
      server.post('/prefixSparql.ttl')
        .set('content-type', 'application/sparql-update')
        .send('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n' +
          '@prefix schema: <http://schema.org/> .\n' +
          '@prefix profile: <http://ogp.me/ns/profile#> .\n' +
          '@prefix ex: <http://example.org/vocab#> .\n' +
          'DELETE { <#> profile:first_name "Tim" }\n' +
          'INSERT { <#> profile:first_name "Timothy" }')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/prefixSparql.ttl'),
            '@prefix schema: <http://schema.org/>.\n' +
            '@prefix profile: <http://ogp.me/ns/profile#>.\n' +
            '\n' +
            '   <#> profile:first_name "Timothy"; a schema:Person .\n')
          rm('sampleContainer/prefixSparql.ttl')
          done(err)
        })
    })
  })

  describe('INSERT', function () {
    it('should add a new triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTriple.ttl')
      server.post('/addingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :test  :hello 456 .}')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/addingTriple.ttl'),
            '\n' +
            '   <#current> <#temp> 123 .\n' +
            '   <#test> <#hello> 456 .\n')
          rm('sampleContainer/addingTriple.ttl')
          done(err)
        })
    })

    it('should add value to existing triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTripleValue.ttl')
      server.post('/addingTripleValue.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp 456 .}')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/addingTripleValue.ttl'),
            '\n' +
            '   <#current> <#temp> 123, 456 .\n')
          rm('sampleContainer/addingTripleValue.ttl')
          done(err)
        })
    })

    it('should add value to same subject', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTripleSubj.ttl')
      server.post('/addingTripleSubj.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp2 456 .}')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/addingTripleSubj.ttl'),
            '\n' +
            '   <#current> <#temp2> 456; <#temp> 123 .\n')
          rm('sampleContainer/addingTripleSubj.ttl')
          done(err)
        })
    })
  })

  it('nothing should change with empty patch', function (done) {
    write(
      '<#current> <#temp> 123 .',
      'sampleContainer/emptyExample.ttl')
    server.post('/emptyExample.ttl')
      .set('content-type', 'application/sparql-update')
      .send('')
      .expect(200)
      .end(function (err, res, body) {
        assert.equal(
          read('sampleContainer/emptyExample.ttl'),
          '\n' +
          '   <#current> <#temp> 123 .\n')
        rm('sampleContainer/emptyExample.ttl')
        done(err)
      })
  })
})
