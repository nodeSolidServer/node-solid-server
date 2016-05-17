var solid = require('../') // or require('solid')
var path = require('path')

solid
  .createServer({
    webid: true,
    sslCert: path.resolve('../test/keys/cert.pem'),
    sslKey: path.resolve('../test/keys/key.pem')
  })
  .listen(3456, function () {
    console.log('started ldp with webid on port ' + 3456)
  })
