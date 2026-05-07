const solid = require('../') // or require('solid-server')

// Startin solid server
const ldp = solid.createServer()
ldp.listen(3456, function () {
  console.log('Starting server on port ' + 3456)
  console.log('LDP will run on /')
})
