// Integration tests for PATCH with application/sparql-update

var ldnode = require('../../index')
var supertest = require('supertest')
var assert = require('chai').assert
var path = require('path')

// Helper functions for the FS
var { rm, write, read } = require('../utils')

describe('PATCH through application/sparql-update', function () {
  // Starting LDP
  var ldp = ldnode({
    root: path.join(__dirname, '../resources/sampleContainer'),
    mount: '/test',
    webid: false
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
          '@prefix : </notExisting.ttl#>.\n\n:test :hello 456 .\n\n')
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
            '@prefix : </existingTriple.ttl#>.\n\n')
          rm('sampleContainer/existingTriple.ttl')
          done(err)
        })
    })

    it('should delete a single triple from a pad document', function (done) {
      var expected = '@prefix : </existingTriple.ttl#>.\n@prefix dc: <http://purl.org/dc/elements/1.1/>.\n@prefix c: <https://www.w3.org/People/Berners-Lee/card#>.\n@prefix n: <http://rdfs.org/sioc/ns#>.\n@prefix p: <http://www.w3.org/ns/pim/pad#>.\n@prefix ic: <http://www.w3.org/2002/12/cal/ical#>.\n@prefix XML: <http://www.w3.org/2001/XMLSchema#>.\n@prefix flow: <http://www.w3.org/2005/01/wf/flow#>.\n@prefix ui: <http://www.w3.org/ns/ui#>.\n@prefix ind: </parent/index.ttl#>.\n@prefix mee: <http://www.w3.org/ns/pim/meeting#>.\n\n:id1477502276660 dc:author c:i; n:content ""; p:next :this.\n\n:id1477522707481\n    ic:dtstart "2016-10-26T22:58:27Z"^^XML:dateTime;\n    flow:participant c:i;\n    ui:backgroundColor "#c1d0c8".\n:this\n    a p:Notepad;\n    dc:author c:i;\n    dc:created "2016-10-25T15:44:42Z"^^XML:dateTime;\n    dc:title "Shared Notes";\n    p:next :id1477502276660.\nind:this flow:participation :id1477522707481; mee:sharedNotes :this.\n\n'

      write(`\n\

        @prefix dc: <http://purl.org/dc/elements/1.1/>.
    @prefix meeting: <http://www.w3.org/ns/pim/meeting#>.
    @prefix card: <https://www.w3.org/People/Berners-Lee/card#>.
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
    @prefix p: <http://www.w3.org/ns/pim/pad#>.
    @prefix in: </parent/index.ttl#>.
    @prefix n: <http://rdfs.org/sioc/ns#>.
    @prefix flow: <http://www.w3.org/2005/01/wf/flow#>.
    @prefix ic: <http://www.w3.org/2002/12/cal/ical#>.
    @prefix ui: <http://www.w3.org/ns/ui#>.

    <#this>
        dc:author
           card:i;
        dc:created
           "2016-10-25T15:44:42Z"^^xsd:dateTime;
        dc:title
           "Shared Notes";
        a    p:Notepad;
        p:next
           <#id1477502276660>.
       in:this flow:participation <#id1477522707481>; meeting:sharedNotes <#this> .
       <#id1477502276660> dc:author card:i; n:content ""; p:indent 1; p:next <#this> .
    <#id1477522707481>
        ic:dtstart
           "2016-10-26T22:58:27Z"^^xsd:dateTime;
        flow:participant
           card:i;
        ui:backgroundColor
           "#c1d0c8".\n`,
        'sampleContainer/existingTriple.ttl')

      server.post('/existingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('DELETE {  <#id1477502276660>  <http://www.w3.org/ns/pim/pad#indent> 1 .}')
        .expect(200)
        .end(function (err, res, body) {
          assert.equal(
            read('sampleContainer/existingTriple.ttl'),
            expected)
          rm('sampleContainer/existingTriple.ttl')
          done(err)
        })
    })
  })

  describe('DELETE and INSERT', function () {
    after(() => rm('sampleContainer/prefixSparql.ttl'))

    it('should update a resource using SPARQL-query using `prefix`', function (done) {
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
            '@prefix : </prefixSparql.ttl#>.\n@prefix schema: <http://schema.org/>.\n@prefix pro: <http://ogp.me/ns/profile#>.\n\n: a schema:Person; pro:first_name "Timothy".\n\n')
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
            '@prefix : </addingTriple.ttl#>.\n\n:current :temp 123 .\n\n:test :hello 456 .\n\n')
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
            '@prefix : </addingTripleValue.ttl#>.\n\n:current :temp 123, 456 .\n\n')
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
            '@prefix : </addingTripleSubj.ttl#>.\n\n:current :temp 123; :temp2 456 .\n\n')
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
          '@prefix : </emptyExample.ttl#>.\n\n:current :temp 123 .\n\n')
        rm('sampleContainer/emptyExample.ttl')
        done(err)
      })
  })
})
