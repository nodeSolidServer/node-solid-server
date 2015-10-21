var ldnode = require('../') // or require('ldnode')
var path = require('path')

ldnode
  .createServer({
    webid: true,
    cert: path.resolve('../test/keys/cert.pem'),
    key: path.resolve('../test/keys/key.pem')
  })
  .listen(3456, function() {
    console.log('started ldp with webid on port ' + 3456)
  })

