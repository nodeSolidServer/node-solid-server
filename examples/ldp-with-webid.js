var ldnode = require('../') // or require('ldnode')

ldnode
  .createServer({
    webid: true,
    cert: 'path/to/your/ssl/cert',
    key: 'path/to/your/ssl/key'
  })
  .listen(3456, function() {
    console.log('started ldp with webid on port ' + 3456)
  })
