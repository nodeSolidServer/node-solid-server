const fs = require('fs')
const path = require('path')
const { setupSupertestServer } = require('../utils')

const server = setupSupertestServer({
  live: true,
  dataBrowserPath: 'default',
  root: path.join(__dirname, '../resources'),
  auth: 'oidc',
  webid: false
})

const invalidTurtleBody = fs.readFileSync(path.join(__dirname, '../resources/invalid1.ttl'), {
  'encoding': 'utf8'
})

describe('HTTP requests with invalid Turtle syntax', () => {
  describe('PUT API', () => {
    it('is allowed with invalid TTL files in general', (done) => {
      server.put('/invalid1.ttl')
        .send(invalidTurtleBody)
        .set('content-type', 'text/turtle')
        .expect(201, done)
    })

    it('is not allowed with invalid ACL files', (done) => {
      server.put('/invalid1.ttl.acl')
        .send(invalidTurtleBody)
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
  })

  describe('PATCH API', () => {
    it('does not support patching of TTL files', (done) => {
      server.patch('/patch-1-initial.ttl')
        .send(invalidTurtleBody)
        .set('content-type', 'text/turtle')
        .expect(415, done)
    })
  })

  describe('POST API (multipart)', () => {
    it('does not validate files that are posted', (done) => {
      server.post('/')
        .attach('invalid1', path.join(__dirname, '../resources/invalid1.ttl'))
        .attach('invalid2', path.join(__dirname, '../resources/invalid2.ttl'))
        .expect(200, done)
    })
  })
})
