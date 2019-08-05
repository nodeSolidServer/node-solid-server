const authProxy = require('../../lib/handlers/auth-proxy')
const nock = require('nock')
const express = require('express')
const request = require('supertest')
const { expect } = require('chai')

const HOST = 'solid.org'
const USER = 'https://ruben.verborgh.org/profile/#me'

describe('Auth Proxy', () => {
  describe('An auth proxy with 2 destinations', () => {
    let loggedIn = true

    let app
    before(() => {
      // Set up test back-end servers
      nock('http://server-a.org').persist()
        .get(/./).reply(200, addRequestDetails('a'))
      nock('https://server-b.org').persist()
        .get(/./).reply(200, addRequestDetails('b'))

      // Set up proxy server
      app = express()
      app.use((req, res, next) => {
        if (loggedIn) {
          req.session = { userId: USER }
        }
        next()
      })
      authProxy(app, {
        '/server/a': 'http://server-a.org',
        '/server/b': 'https://server-b.org/foo/bar'
      })
    })

    after(() => {
      // Release back-end servers
      nock.cleanAll()
    })

    describe('responding to /server/a', () => {
      let response
      before(() => {
        return request(app).get('/server/a')
          .set('Host', HOST)
          .then(res => { response = res })
      })

      it('proxies to http://server-a.org/', () => {
        const { server, path } = response.body
        expect(server).to.equal('a')
        expect(path).to.equal('/')
      })

      it('sets the User header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('user', USER)
      })

      it('sets the Host header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('host', 'server-a.org')
      })

      it('sets the Forwarded header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('forwarded', `host=${HOST}`)
      })

      it('returns status code 200', () => {
        expect(response.statusCode).to.equal(200)
      })
    })

    describe('responding to /server/a/my/path?query=string', () => {
      let response
      before(() => {
        return request(app).get('/server/a/my/path?query=string')
          .set('Host', HOST)
          .then(res => { response = res })
      })

      it('proxies to http://server-a.org/my/path?query=string', () => {
        const { server, path } = response.body
        expect(server).to.equal('a')
        expect(path).to.equal('/my/path?query=string')
      })

      it('sets the User header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('user', USER)
      })

      it('sets the Host header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('host', 'server-a.org')
      })

      it('sets the Forwarded header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('forwarded', `host=${HOST}`)
      })

      it('returns status code 200', () => {
        expect(response.statusCode).to.equal(200)
      })
    })

    describe('responding to /server/b', () => {
      let response
      before(() => {
        return request(app).get('/server/b')
          .set('Host', HOST)
          .then(res => { response = res })
      })

      it('proxies to http://server-b.org/foo/bar', () => {
        const { server, path } = response.body
        expect(server).to.equal('b')
        expect(path).to.equal('/foo/bar')
      })

      it('sets the User header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('user', USER)
      })

      it('sets the Host header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('host', 'server-b.org')
      })

      it('sets the Forwarded header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('forwarded', `host=${HOST}`)
      })

      it('returns status code 200', () => {
        expect(response.statusCode).to.equal(200)
      })
    })

    describe('responding to /server/b/my/path?query=string', () => {
      let response
      before(() => {
        return request(app).get('/server/b/my/path?query=string')
          .set('Host', HOST)
          .then(res => { response = res })
      })

      it('proxies to http://server-b.org/foo/bar/my/path?query=string', () => {
        const { server, path } = response.body
        expect(server).to.equal('b')
        expect(path).to.equal('/foo/bar/my/path?query=string')
      })

      it('sets the User header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('user', USER)
      })

      it('sets the Host header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('host', 'server-b.org')
      })

      it('sets the Forwarded header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('forwarded', `host=${HOST}`)
      })

      it('returns status code 200', () => {
        expect(response.statusCode).to.equal(200)
      })
    })

    describe('responding to /server/a without a logged-in user', () => {
      let response
      before(() => {
        loggedIn = false
        return request(app).get('/server/a')
          .set('Host', HOST)
          .then(res => { response = res })
      })
      after(() => {
        loggedIn = true
      })

      it('proxies to http://server-a.org/', () => {
        const { server, path } = response.body
        expect(server).to.equal('a')
        expect(path).to.equal('/')
      })

      it('does not set the User header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.not.have.property('user')
      })

      it('sets the Host header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('host', 'server-a.org')
      })

      it('sets the Forwarded header on the proxy request', () => {
        const { headers } = response.body
        expect(headers).to.have.property('forwarded', `host=${HOST}`)
      })

      it('returns status code 200', () => {
        expect(response.statusCode).to.equal(200)
      })
    })
  })
})

function addRequestDetails (server) {
  return function (path) {
    return { server, path, headers: this.req.headers }
  }
}
