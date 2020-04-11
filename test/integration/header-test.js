const { expect } = require('chai')
const path = require('path')
const ldnode = require('../../index')
const supertest = require('supertest')

const serverOptions = {
  root: path.join(__dirname, '../resources/headers'),
  multiuser: false,
  webid: true,
  sslKey: path.join(__dirname, '../keys/key.pem'),
  sslCert: path.join(__dirname, '../keys/cert.pem'),
  forceUser: 'https://ruben.verborgh.org/profile/#me'
}

describe('Header handler', () => {
  let request

  before(() => {
    const server = ldnode.createServer(serverOptions)
    request = supertest(server)
  })

  describe('MS-Author-Via', () => {
    describeHeaderTest('read/append for the public', {
      resource: '/public-ra',
      headers: {
        'MS-Author-Via': 'SPARQL',
        'Access-Control-Expose-Headers': /(^|,\s*)MS-Author-Via(,|$)/
      }
    })
  })

  describe('WAC-Allow', () => {
    describeHeaderTest('read/append for the public', {
      resource: '/public-ra',
      headers: {
        'WAC-Allow': 'user="read append",public="read append"',
        'Access-Control-Expose-Headers': /(^|,\s*)WAC-Allow(,|$)/
      }
    })

    describeHeaderTest('read/write for the user, read for the public', {
      resource: '/user-rw-public-r',
      headers: {
        'WAC-Allow': 'user="read write append",public="read"',
        'Access-Control-Expose-Headers': /(^|,\s*)WAC-Allow(,|$)/
      }
    })

    describeHeaderTest('read/write/append/control for the user, nothing for the public', {
      resource: '/user-rwac-public-0',
      headers: {
        'WAC-Allow': 'user="read write append control",public=""',
        'Access-Control-Expose-Headers': /(^|,\s*)WAC-Allow(,|$)/
      }
    })
  })

  function describeHeaderTest (label, { resource, headers }) {
    describe(`a resource that is ${label}`, () => {
      // Retrieve the response headers
      let response = {}
      before(async () => {
        const { headers } = await request.get(resource)
        response.headers = headers
      })

      // Assert the existence of each of the expected headers
      for (const header in headers) {
        assertResponseHasHeader(response, header, headers[header])
      }
    })
  }

  function assertResponseHasHeader (response, name, value) {
    const key = name.toLowerCase()
    if (value instanceof RegExp) {
      it(`has a ${name} header matching ${value}`, () => {
        expect(response.headers).to.have.property(key)
        expect(response.headers[key]).to.match(value)
      })
    } else {
      it(`has a ${name} header of ${value}`, () => {
        expect(response.headers).to.have.property(key, value)
      })
    }
  }
})
