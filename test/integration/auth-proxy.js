const ldnode = require('../../index')
const path = require('path')
const nock = require('nock')
const request = require('supertest')
const { expect } = require('chai')
const rm = require('../test-utils').rm

const HOST = 'solid.org'
const USER = 'https://ruben.verborgh.org/profile/#me'

describe('Auth Proxy', () => {
  describe('A Solid server with the authProxy option', () => {
    let server
    before(() => {
      // Set up test back-end server
      nock('http://server-a.org').persist()
        .get(/./).reply(200, function () { return this.req.headers })

      // Set up Solid server
      server = ldnode({
        root: path.join(__dirname, '../resources'),
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

    describe('responding to /server/a', () => {
      let response
      before(() => {
        return request(server).get('/server/a')
          .set('Host', HOST)
          .then(res => { response = res })
      })

      it('sets the User header on the proxy request', () => {
        expect(response.body).to.have.property('user', USER)
      })

      it('returns status code 200', () => {
        expect(response).to.have.property('statusCode', 200)
      })
    })
  })
})
