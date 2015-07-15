var ldnode = require('../') // or require('ldnode')

// Startin ldnode server
var ldp = ldnode.createServer()
ldp.listen(3456, function() {
  console.log('Starting server on port ' + 3456)
  console.log('LDP will run on /')
})

