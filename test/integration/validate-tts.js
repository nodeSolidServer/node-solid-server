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

describe('Validate HTTP requests with Turtle syntax', function () {
  describe('PUT API', function () {
    const putRequestBody = fs.readFileSync(path.join(__dirname, '../resources/sampleContainer/invalid.ttl'), {
      'encoding': 'utf8'
    })
    it('should return 400', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
  })

  // describe('POST (multipart)', function () {
  //   it('should create as many files as the ones passed in multipart',
  //     function (done) {
  //       server.post('/sampleContainer/')
  //         .attach('timbl', path.join(__dirname, '../resources/timbl.jpg'))
  //         .attach('nicola', path.join(__dirname, '../resources/nicola.jpg'))
  //         .expect(200)
  //         .end(function (err) {
  //           if (err) return done(err)
  //
  //           var sizeNicola = fs.statSync(path.join(__dirname,
  //             '../resources/nicola.jpg')).size
  //           var sizeTim = fs.statSync(path.join(__dirname, '../resources/timbl.jpg')).size
  //           var sizeNicolaLocal = fs.statSync(path.join(__dirname,
  //             '../resources/sampleContainer/nicola.jpg')).size
  //           var sizeTimLocal = fs.statSync(path.join(__dirname,
  //             '../resources/sampleContainer/timbl.jpg')).size
  //
  //           if (sizeNicola === sizeNicolaLocal && sizeTim === sizeTimLocal) {
  //             return done()
  //           } else {
  //             return done(new Error('Either the size (remote/local) don\'t match or files are not stored'))
  //           }
  //         })
  //     })
  //   after(function () {
  //     // Clean up after POST (multipart) API tests
  //     return Promise.all([
  //       rm('/sampleContainer/nicola.jpg'),
  //       rm('/sampleContainer/timbl.jpg')
  //     ])
  //   })
  // })
})
