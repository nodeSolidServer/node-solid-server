'use strict'

const chai = require('chai')
// const fs = require('fs')
const expect = chai.expect
// const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
// const HttpMocks = require('node-mocks-http')

const $rdf = require('rdflib')
const rewire = require('rewire')
const app = rewire('../../lib/handlers/patch/n3-patch-parser.js')

const PATCH_NS = 'http://www.w3.org/ns/solid/terms#'
const PREFIXES = `PREFIX solid: <${PATCH_NS}>\n`

const queryForFirstResult = app.__get__('queryForFirstResult')
const parsePatchDocument = app.__get__('parsePatchDocument')

describe('n3-patch-parser', () => {
  describe('parsePatchDocument()', () => {
    it('tests parsePatchDocument()', async () => {
      let targetURI // not needed for deprecated
      const patchURI = 'http://localhost:7777/resources/read-write.ttl'
      const patchText = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
      @prefix ex: <http://www.example.org/terms#>.
      
      _:rename a solid:InsertDeletePatch;
        solid:deletes { ?a <b> <c>. }.`
      const result = await parsePatchDocument(targetURI, patchURI, patchText)
      expect(result).to.not.be.undefined()
    })

    it('should fail with error 400', () => {
      let targetURI // not needed for deprecated
      const patchURI = 'http://localhost:7777/resources/read-write.ttl'
      const patchText = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
      @prefix ex: <http://www.example.org/terms#>.
      
      _:rename a solid:InsertDeletePatch;
        solid:where { ?a <b> <c>. }.`

      parsePatchDocument(targetURI, patchURI, patchText)
        .catch(err => {
          expect(err.status).to.be(400)
          expect(err.message).to.be('Patch should at least contain inserts or deletes.')
        })
    })
  })

  describe('queryForFirstResult()', () => {
    it('tests queryForFirstResult', async () => {
      // let targetURI // not needed for deprecated
      const patchURI = 'http://localhost:7777/resources/read-write.ttl'
      const patchGraph = $rdf.graph()
      const patchText = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
      @prefix ex: <http://www.example.org/terms#>.
      
      _:rename a solid:InsertDeletePatch;
        solid:deletes { ?a <b> <c>. }.`
      $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
      const result = await queryForFirstResult(patchGraph, `${PREFIXES}
      SELECT ?insert ?delete ?where WHERE {
        ?patch a solid:InsertDeletePatch.
        OPTIONAL { ?patch solid:inserts ?insert. }
        OPTIONAL { ?patch solid:deletes ?delete. }
        OPTIONAL { ?patch solid:where   ?where.  }
      }`)
      const { '?insert': insert, '?delete': deleted, '?where': where } = result
      expect(insert).to.be.undefined()
      expect(deleted).to.not.be.undefined()
      expect(where).to.be.undefined()
    })
  })
})
