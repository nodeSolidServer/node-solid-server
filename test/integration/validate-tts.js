const fs = require('fs')
const path = require('path')
const { setupSuperServer } = require('../utils')

const server = setupSuperServer({
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
    it('should return 400', (done) => {
      server.put('/should-not-be-created.ttl')
        .send(invalidTurtleBody)
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
  })

  describe.skip('PATCH API', () => {
    it('should return 400', (done) => { // TODO: This returns 415 right now
      server.patch('/patch-1-initial.ttl')
        .send(invalidTurtleBody)
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
  })

  describe.skip('POST API (multipart)', () => { // TODO: Is this something we should validate?
    it('should create as many files as the ones passed in multipart', (done) => {
      server.post('/')
        .attach('timbl', path.join(__dirname, '../resources/invalid1.ttl'))
        .attach('nicola', path.join(__dirname, '../resources/invalid2.ttl'))
        .expect(400, done)
    })
  })
})
