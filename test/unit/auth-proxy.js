const authProxy = require('../../lib/handlers/auth-proxy')
const nock = require('nock')
const express = require('express')
const request = require('supertest')
const { expect } = require('chai')

describe('Auth Proxy', () => {
  describe('An auth proxy with 2 destinations', () => {
    let app
    before(() => {
      nock('http://server-a.org').persist()
        .get(/./).reply(200, addRequestDetails('a'))
      nock('https://server-b.org').persist()
        .get(/./).reply(200, addRequestDetails('b'))

      app = express()
      authProxy(app, {
        '/server/a': 'http://server-a.org',
        '/server/b': 'https://server-b.org/foo/bar'
      })
    })

    describe('responding to /server/a', () => {
      let response
      before(() => {
        return request(app).get('/server/a')
          .then(res => { response = res })
      })

      it('proxies to http://server-a.org/', () => {
        const { server, path } = response.body
        expect(server).to.equal('a')
        expect(path).to.equal('/')
      })

      it('returns status code 200', () => {
        expect(response).to.have.property('statusCode', 200)
      })
    })

    describe('responding to /server/a/my/path?query=string', () => {
      let response
      before(() => {
        return request(app).get('/server/a/my/path?query=string')
          .then(res => { response = res })
      })

      it('proxies to http://server-a.org/my/path?query=string', () => {
        const { server, path } = response.body
        expect(server).to.equal('a')
        expect(path).to.equal('/my/path?query=string')
      })

      it('returns status code 200', () => {
        expect(response).to.have.property('statusCode', 200)
      })
    })

    describe('responding to /server/b', () => {
      let response
      before(() => {
        return request(app).get('/server/b')
          .then(res => { response = res })
      })

      it('proxies to http://server-b.org/foo/bar', () => {
        const { server, path } = response.body
        expect(server).to.equal('b')
        expect(path).to.equal('/foo/bar')
      })

      it('returns status code 200', () => {
        expect(response).to.have.property('statusCode', 200)
      })
    })

    describe('responding to /server/b/my/path?query=string', () => {
      let response
      before(() => {
        return request(app).get('/server/b/my/path?query=string')
          .then(res => { response = res })
      })

      it('proxies to http://server-b.org/foo/bar/my/path?query=string', () => {
        const { server, path } = response.body
        expect(server).to.equal('b')
        expect(path).to.equal('/foo/bar/my/path?query=string')
      })

      it('returns status code 200', () => {
        expect(response).to.have.property('statusCode', 200)
      })
    })
  })
})

function addRequestDetails (server) {
  return function (path) {
    return { server, path, headers: this.req.headers }
  }
}
