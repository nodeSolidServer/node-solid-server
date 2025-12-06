import { describe, it } from 'mocha'
import { assert } from 'chai'
import fetch from 'node-fetch'

import * as utils from '../../lib/utils.mjs'
const { Headers } = fetch

const {
  pathBasename,
  stripLineEndings,
  debrack,
  fullUrlForReq,
  getContentType
} = utils

describe('Utility functions', function () {
  describe('pathBasename', function () {
    it('should return bar as relative path for /foo/bar', function () {
      assert.equal(pathBasename('/foo/bar'), 'bar')
    })
    it('should return empty as relative path for /foo/', function () {
      assert.equal(pathBasename('/foo/'), '')
    })
    it('should return empty as relative path for /', function () {
      assert.equal(pathBasename('/'), '')
    })
    it('should return empty as relative path for empty path', function () {
      assert.equal(pathBasename(''), '')
    })
    it('should return empty as relative path for undefined path', function () {
      assert.equal(pathBasename(undefined), '')
    })
  })

  describe('stripLineEndings()', () => {
    it('should pass through falsy string arguments', () => {
      assert.equal(stripLineEndings(''), '')
      assert.equal(stripLineEndings(null), null)
      assert.equal(stripLineEndings(undefined), undefined)
    })

    it('should remove line-endings characters', () => {
      let str = '123\n456'
      assert.equal(stripLineEndings(str), '123456')

      str = `123
456`
      assert.equal(stripLineEndings(str), '123456')
    })
  })

  describe('debrack()', () => {
    it('should return null if no string is passed', () => {
      assert.equal(debrack(), null)
    })

    it('should return the string if no brackets are present', () => {
      assert.equal(debrack('test string'), 'test string')
    })

    it('should return the string if less than 2 chars long', () => {
      assert.equal(debrack(''), '')
      assert.equal(debrack('<'), '<')
    })

    it('should remove brackets if wrapping the string', () => {
      assert.equal(debrack('<test string>'), 'test string')
    })
  })

  describe('fullUrlForReq()', () => {
    it('should extract a fully-qualified url from an Express request', () => {
      const req = {
        protocol: 'https:',
        get: (host) => 'example.com',
        baseUrl: '/',
        path: '/resource1',
        query: { sort: 'desc' }
      }

      assert.equal(fullUrlForReq(req), 'https://example.com/resource1?sort=desc')
    })
  })

  describe('getContentType()', () => {
    describe('for Express headers', () => {
      it('should not default', () => {
        assert.equal(getContentType({}), '')
      })

      it('should get a basic content type', () => {
        assert.equal(getContentType({ 'content-type': 'text/html' }), 'text/html')
      })

      it('should get a content type without its charset', () => {
        assert.equal(getContentType({ 'content-type': 'text/html; charset=us-ascii' }), 'text/html')
      })
    })

    describe('for Fetch API headers', () => {
      it('should not default', () => {
        assert.equal(getContentType(new Headers({})), '')
      })

      it('should get a basic content type', () => {
        assert.equal(getContentType(new Headers({ 'content-type': 'text/html' })), 'text/html')
      })

      it('should get a content type without its charset', () => {
        assert.equal(getContentType(new Headers({ 'content-type': 'text/html; charset=us-ascii' })), 'text/html')
      })
    })
  })
})
