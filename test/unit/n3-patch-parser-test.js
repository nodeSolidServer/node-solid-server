'use strict'

const chai = require('chai')
const fs = require('fs')
// const expect = chai.expect
// const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()
// const HttpMocks = require('node-mocks-http')

const $rdf = require('rdflib')
// const rewire = require('rewire')
// const app = rewire('../../lib/handlers/patch/n3-patch-parser.js')

// const queryForFirstResult = app.__get__('queryForFirstResult')
// const parsePatchDocument = app.__get__('parsePatchDocument')

describe('n3-patch-parser', () => {
  const testN3File = './n3-test-doc.ttl'
  before(() => {
    const content = 'content'
    fs.writeFile(testN3File, content, err => {
      if (err) console.err('failed to write')
    })
  })

  after(() => {
    fs.unlink(testN3File, (err) => {
      if (err) console.err('failed to delete test file')
    })
  })

  describe('parsePatchDocument()', () => {
    it('tests parsePatchDocument()', () => {
    //   let targetURI // not needed for deprecated
    //   const patchURI = 'https://example.org'
    //   const patchGraph = $rdf.graph()
    //   const patchText = ''
    //   $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
    })
  })

  describe('queryForFirstResult()', () => {
    it('tests queryForFirstResult', async () => {
      // let targetURI // not needed for deprecated
      const patchURI = 'https://example.org'
      const patchGraph = $rdf.graph()
      const patchText = ''
      $rdf.parse(patchText, patchGraph, patchURI, 'text/n3')
      // const result = await queryForFirstResult(patchGraph, `${PREFIXES}
      // SELECT ?insert ?delete ?where WHERE {
      //   ?patch solid:patches <${targetURI}>.
      //   OPTIONAL { ?patch solid:inserts ?insert. }
      //   OPTIONAL { ?patch solid:deletes ?delete. }
      //   OPTIONAL { ?patch solid:where   ?where.  }
      // }`)
    })
  })
})