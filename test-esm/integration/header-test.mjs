import { createRequire } from 'module'
import { expect } from 'chai'
import supertest from 'supertest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const { setupSupertestServer } = require('../../test/utils')

describe('Header handler', () => {
  let request

  before(function () {
    this.timeout(20000)
    request = setupSupertestServer({
      root: join(__dirname, '../../test/resources/headers'),
      multiuser: false,
      webid: true,
      sslKey: join(__dirname, '../../test/keys/key.pem'),
      sslCert: join(__dirname, '../../test/keys/cert.pem'),
      forceUser: 'https://ruben.verborgh.org/profile/#me'
    })
  })

  describe('MS-Author-Via', () => { // deprecated
    describeHeaderTest('read/append for the public', {
      resource: '/public-ra',
      headers: {
        'MS-Author-Via': 'SPARQL',
        'Access-Control-Expose-Headers': /(^|,\s*)MS-Author-Via(,|$)/
      }
    })
  })

  describe('Accept-* for a resource document', () => {
    describeHeaderTest('read/append for the public', {
      resource: '/public-ra',
      headers: {
        'Accept-Patch': 'text/n3, application/sparql-update, application/sparql-update-single-match',
        'Accept-Post': '*/*',
        'Accept-Put': '*/*',
        'Access-Control-Expose-Headers': /(^|,\s*)Accept-Patch, Accept-Post, Accept-Put(,|$)/
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

    // FIXME: https://github.com/solid/node-solid-server/issues/1502
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
      const response = {}
      before(async function () {
        this.timeout(10000) // FIXME: https://github.com/solid/node-solid-server/issues/1443
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