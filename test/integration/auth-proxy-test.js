const ldnode = require('../../index')
const path = require('path')
const nock = require('nock')
const request = require('supertest')
const { expect } = require('chai')
const rm = require('../utils').rm

const USER = 'https://ruben.verborgh.org/profile/#me'

describe('Auth Proxy', () => {
  describe('A Solid server with the authProxy option', () => {
    let server
    before(() => {
      // Set up test back-end server
      nock('http://server-a.org').persist()
        .get(/./).reply(200, function () { return this.req.headers })
        .options(/./).reply(200)
        .post(/./).reply(200)

      // Set up Solid server
      server = ldnode({
        root: path.join(__dirname, '../resources/auth-proxy'),
        configPath: path.join(__dirname, '../resources/config'),
        authProxy: {
          '/server/a': 'http://server-a.org'
        },
        forceUser: USER
      })
    })

    after(() => {
      // Release back-end server
      nock.cleanAll()
      // Remove created index files
      rm('index.html')
      rm('index.html.acl')
    })

    // Skipped tests due to not supported deep acl:accessTo #963
    describe.skip('responding to /server/a', () => {
      let response
      before(() =>
        request(server).get('/server/a/')
          .then(res => { response = res })
      )

      it('sets the User header on the proxy request', () => {
        expect(response.body).to.have.property('user', USER)
      })
    })

    describe('responding to GET', () => {
      describe.skip('for a path with read permissions', () => {
        let response
        before(() =>
          request(server).get('/server/a/r')
            .then(res => { response = res })
        )
        it('returns status code 200', () => {
          expect(response.statusCode).to.equal(200)
        })
      })

      describe('for a path without read permissions', () => {
        let response
        before(() =>
          request(server).get('/server/a/wc')
            .then(res => { response = res })
        )

        it('returns status code 403', () => {
          expect(response.statusCode).to.equal(403)
        })
      })
    })

    describe('responding to OPTIONS', () => {
      describe.skip('for a path with read permissions', () => {
        let response
        before(() =>
          request(server).options('/server/a/r')
            .then(res => { response = res })
        )
        it('returns status code 200', () => {
          expect(response.statusCode).to.equal(200)
        })
      })

      describe('for a path without read permissions', () => {
        let response
        before(() =>
          request(server).options('/server/a/wc')
            .then(res => { response = res })
        )

        it('returns status code 403', () => {
          expect(response.statusCode).to.equal(403)
        })
      })
    })

    describe('responding to POST', () => {
      describe.skip('for a path with read and write permissions', () => {
        let response
        before(() =>
          request(server).post('/server/a/rw')
            .then(res => { response = res })
        )
        it('returns status code 200', () => {
          expect(response.statusCode).to.equal(200)
        })
      })

      describe('for a path without read permissions', () => {
        let response
        before(() =>
          request(server).post('/server/a/w')
            .then(res => { response = res })
        )

        it('returns status code 403', () => {
          expect(response.statusCode).to.equal(403)
        })
      })

      describe('for a path without write permissions', () => {
        let response
        before(() =>
          request(server).post('/server/a/r')
            .then(res => { response = res })
        )

        it('returns status code 403', () => {
          expect(response.statusCode).to.equal(403)
        })
      })
    })
  })
})
