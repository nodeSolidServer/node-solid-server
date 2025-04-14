// Integration tests for PATCH with application/sparql-update

const ldnode = require('../../index')
const supertest = require('supertest')
const assert = require('chai').assert
const path = require('path')

// Helper functions for the FS
const { rm, write, read } = require('../utils')

describe('PATCH through application/sparql-update', function () {
  // Starting LDP
  const ldp = ldnode({
    root: path.join(__dirname, '../resources/sampleContainer'),
    mount: '/test',
    webid: false
  })
  const server = supertest(ldp)

  it('should create a new file if file does not exist', function (done) {
    rm('sampleContainer/notExisting.ttl')
    server.patch('/notExisting.ttl')
      .set('content-type', 'application/sparql-update')
      .send('INSERT DATA { :test  :hello 456 .}')
      .expect(201)
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
      const expected = `\
@prefix : </existingTriple.ttl#>.
@prefix cal: <http://www.w3.org/2002/12/cal/ical#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix meeting: <http://www.w3.org/ns/pim/meeting#>.
@prefix pad: <http://www.w3.org/ns/pim/pad#>.
@prefix sioc: <http://rdfs.org/sioc/ns#>.
@prefix ui: <http://www.w3.org/ns/ui#>.
@prefix wf: <http://www.w3.org/2005/01/wf/flow#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
@prefix c: <https://www.w3.org/People/Berners-Lee/card#>.
@prefix ind: </parent/index.ttl#>.

:id1477502276660 dc:author c:i; sioc:content ""; pad:next :this.

:id1477522707481\n    cal:dtstart "2016-10-26T22:58:27Z"^^xsd:dateTime;
    wf:participant c:i;
    ui:backgroundColor "#c1d0c8".
:this
    a pad:Notepad;
    dc:author c:i;
    dc:created "2016-10-25T15:44:42Z"^^xsd:dateTime;
    dc:title "Shared Notes";
    pad:next :id1477502276660 .
ind:this wf:participation :id1477522707481; meeting:sharedNotes :this.

`
      write(`\n\

        @prefix dc: <http://purl.org/dc/elements/1.1/>.
    @prefix mee: <http://www.w3.org/ns/pim/meeting#>.
    @prefix c: <https://www.w3.org/People/Berners-Lee/card#>.
    @prefix XML: <http://www.w3.org/2001/XMLSchema#>.
    @prefix p: <http://www.w3.org/ns/pim/pad#>.
    @prefix ind: </parent/index.ttl#>.
    @prefix n: <http://rdfs.org/sioc/ns#>.
    @prefix flow: <http://www.w3.org/2005/01/wf/flow#>.
    @prefix ic: <http://www.w3.org/2002/12/cal/ical#>.
    @prefix ui: <http://www.w3.org/ns/ui#>.

    <#this>
        dc:author
           c:i;
        dc:created
           "2016-10-25T15:44:42Z"^^XML:dateTime;
        dc:title
           "Shared Notes";
        a    p:Notepad;
        p:next
           <#id1477502276660>.
       ind:this flow:participation <#id1477522707481>; mee:sharedNotes <#this> .
       <#id1477502276660> dc:author c:i; n:content ""; p:indent 1; p:next <#this> .
    <#id1477522707481>
        ic:dtstart
           "2016-10-26T22:58:27Z"^^XML:dateTime;
        flow:participant
           c:i;
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
        '@prefix pro: <http://ogp.me/ns/profile#> .\n' +
        '# <http://example.com/timbl#> a schema:Person ;\n' +
        '<#> a schema:Person ;\n' +
        '  pro:first_name "Tim" .\n',
        'sampleContainer/prefixSparql.ttl')
      server.post('/prefixSparql.ttl')
        .set('content-type', 'application/sparql-update')
        .send('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n' +
          '@prefix schema: <http://schema.org/> .\n' +
          '@prefix pro: <http://ogp.me/ns/profile#> .\n' +
          '@prefix ex: <http://example.org/vocab#> .\n' +
          'DELETE { <#> pro:first_name "Tim" }\n' +
          'INSERT { <#> pro:first_name "Timothy" }')
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
