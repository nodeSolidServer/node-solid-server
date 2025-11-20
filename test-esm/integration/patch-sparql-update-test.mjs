// ESM version of integration test for PATCH with application/sparql-update
import { describe, it, after } from 'mocha';
import { strict as assert } from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { rm, write, read } from '../utils.mjs';
// import supertest from 'supertest';
// import ldnode from '../../index.js';
import { createRequire } from 'module'


const require = createRequire(import.meta.url);
const ldnode = require('../../index.js');
const supertest = require('supertest');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fse = require('fs-extra');

before(function () {
  // fse.ensureDirSync(path.join(__dirname, '../test/resources/sampleContainer'));
});

describe('PATCH through application/sparql-update', function () {
  // Starting LDP
  const ldp = ldnode({
    root: path.join(__dirname, '../resources/sampleContainer'),
    mount: '/test-esm',
    webid: false
  });
  const server = supertest(ldp);
 
  it('should create a new file if file does not exist', function (done) {
    rm('sampleContainer/notExisting.ttl');
    const sampleContainerPath = path.join(__dirname, '../test-esm/resources/sampleContainer');
    // fse.ensureDirSync(sampleContainerPath);
    server.patch('/notExisting.ttl')
      .set('content-type', 'application/sparql-update')
      .send('INSERT DATA { :test  :hello 456 .}')
      .expect(201)
      .end(function (err, res) {
        assert.equal(
          read('sampleContainer/notExisting.ttl'),
          '@prefix : </notExisting.ttl#>.\n\n:test :hello 456 .\n\n'
        );
        rm('sampleContainer/notExisting.ttl');
        done(err);
      });
  });

  describe('DELETE', function () {
    it('should be an empty resource if last triple is deleted', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/existingTriple.ttl'
      );
      server.post('/existingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('DELETE { :current  :temp 123 .}')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/existingTriple.ttl'),
            '@prefix : </existingTriple.ttl#>.\n\n'
          );
          rm('sampleContainer/existingTriple.ttl');
          done(err);
        });
    });

    it('should delete a single triple from a pad document', function (done) {
      const expected = `@prefix : </existingTriple.ttl#>.\n@prefix cal: <http://www.w3.org/2002/12/cal/ical#>.\n@prefix dc: <http://purl.org/dc/elements/1.1/>.\n@prefix meeting: <http://www.w3.org/ns/pim/meeting#>.\n@prefix pad: <http://www.w3.org/ns/pim/pad#>.\n@prefix sioc: <http://rdfs.org/sioc/ns#>.\n@prefix ui: <http://www.w3.org/ns/ui#>.\n@prefix wf: <http://www.w3.org/2005/01/wf/flow#>.\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.\n@prefix c: <https://www.w3.org/People/Berners-Lee/card#>.\n@prefix ind: </parent/index.ttl#>.\n\n:id1477502276660 dc:author c:i; sioc:content \"\"; pad:next :this.\n\n:id1477522707481\n    cal:dtstart \"2016-10-26T22:58:27Z\"^^xsd:dateTime;\n    wf:participant c:i;\n    ui:backgroundColor \"#c1d0c8\".\n:this\n    a pad:Notepad;\n    dc:author c:i;\n    dc:created \"2016-10-25T15:44:42Z\"^^xsd:dateTime;\n    dc:title \"Shared Notes\";\n    pad:next :id1477502276660 .\nind:this wf:participation :id1477522707481; meeting:sharedNotes :this.\n\n`;
      write(`\n\n        @prefix dc: <http://purl.org/dc/elements/1.1/>.\n    @prefix mee: <http://www.w3.org/ns/pim/meeting#>.\n    @prefix c: <https://www.w3.org/People/Berners-Lee/card#>.\n    @prefix XML: <http://www.w3.org/2001/XMLSchema#>.\n    @prefix p: <http://www.w3.org/ns/pim/pad#>.\n    @prefix ind: </parent/index.ttl#>.\n    @prefix n: <http://rdfs.org/sioc/ns#>.\n    @prefix flow: <http://www.w3.org/2005/01/wf/flow#>.\n    @prefix ic: <http://www.w3.org/2002/12/cal/ical#>.\n    @prefix ui: <http://www.w3.org/ns/ui#>.\n\n    <#this>\n        dc:author\n           c:i;\n        dc:created\n           \"2016-10-25T15:44:42Z\"^^XML:dateTime;\n        dc:title\n           \"Shared Notes\";\n        a    p:Notepad;\n        p:next\n           <#id1477502276660>.\n       ind:this flow:participation <#id1477522707481>; mee:sharedNotes <#this> .\n       <#id1477502276660> dc:author c:i; n:content \"\"; p:indent 1; p:next <#this> .\n    <#id1477522707481>\n        ic:dtstart\n           \"2016-10-26T22:58:27Z\"^^XML:dateTime;\n        flow:participant\n           c:i;\n        ui:backgroundColor\n           \"#c1d0c8\".\n`,
        'sampleContainer/existingTriple.ttl'
      );
      server.post('/existingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('DELETE {  <#id1477502276660>  <http://www.w3.org/ns/pim/pad#indent> 1 .}')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/existingTriple.ttl'),
            expected
          );
          rm('sampleContainer/existingTriple.ttl');
          done(err);
        });
    });
  });

  describe('DELETE and INSERT', function () {
    after(() => rm('sampleContainer/prefixSparql.ttl'));

    it('should update a resource using SPARQL-query using `prefix`', function (done) {
      write(
        '@prefix schema: <http://schema.org/> .\n' +
        '@prefix pro: <http://ogp.me/ns/profile#> .\n' +
        '# <http://example.com/timbl#> a schema:Person ;\n' +
        '<#> a schema:Person ;\n' +
        '  pro:first_name "Tim" .\n',
        'sampleContainer/prefixSparql.ttl'
      );
      server.post('/prefixSparql.ttl')
        .set('content-type', 'application/sparql-update')
        .send('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n' +
          '@prefix schema: <http://schema.org/> .\n' +
          '@prefix pro: <http://ogp.me/ns/profile#> .\n' +
          '@prefix ex: <http://example.org/vocab#> .\n' +
          'DELETE { <#> pro:first_name "Tim" }\n' +
          'INSERT { <#> pro:first_name "Timothy" }')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/prefixSparql.ttl'),
            '@prefix : </prefixSparql.ttl#>.\n@prefix schema: <http://schema.org/>.\n@prefix pro: <http://ogp.me/ns/profile#>.\n\n: a schema:Person; pro:first_name "Timothy".\n\n'
          );
          done(err);
        });
    });
  });

  describe('INSERT', function () {
    it('should add a new triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTriple.ttl'
      );
      server.post('/addingTriple.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :test  :hello 456 .}')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/addingTriple.ttl'),
            '@prefix : </addingTriple.ttl#>.\n\n:current :temp 123 .\n\n:test :hello 456 .\n\n'
          );
          rm('sampleContainer/addingTriple.ttl');
          done(err);
        });
    });

    it('should add value to existing triple', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTripleValue.ttl'
      );
      server.post('/addingTripleValue.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp 456 .}')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/addingTripleValue.ttl'),
            '@prefix : </addingTripleValue.ttl#>.\n\n:current :temp 123, 456 .\n\n'
          );
          rm('sampleContainer/addingTripleValue.ttl');
          done(err);
        });
    });

    it('should add value to same subject', function (done) {
      write(
        '<#current> <#temp> 123 .',
        'sampleContainer/addingTripleSubj.ttl'
      );
      server.post('/addingTripleSubj.ttl')
        .set('content-type', 'application/sparql-update')
        .send('INSERT DATA { :current  :temp2 456 .}')
        .expect(200)
        .end(function (err, res) {
          assert.equal(
            read('sampleContainer/addingTripleSubj.ttl'),
            '@prefix : </addingTripleSubj.ttl#>.\n\n:current :temp 123; :temp2 456 .\n\n'
          );
          rm('sampleContainer/addingTripleSubj.ttl');
          done(err);
        });
    });
  });

  it('nothing should change with empty patch', function (done) {
    write(
      '<#current> <#temp> 123 .',
      'sampleContainer/emptyExample.ttl'
    );
    server.post('/emptyExample.ttl')
      .set('content-type', 'application/sparql-update')
      .send('')
      .expect(200)
      .end(function (err, res) {
        assert.equal(
          read('sampleContainer/emptyExample.ttl'),
          '@prefix : </emptyExample.ttl#>.\n\n:current :temp 123 .\n\n'
        );
        rm('sampleContainer/emptyExample.ttl');
        done(err);
      });
  });
});
