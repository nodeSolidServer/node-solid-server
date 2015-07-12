var express = require('express')
var ldnode = require('../') // or require('ldnode')

// Starting our express app
var app = express()

// My routes
app.get('/', function (req, res) {
  res.send('Welcome to my server!')
})

// Mounting ldnode on /ldp
app.use('/ldp', ldnode({
  uri: 'http://localhost:3000/ldp'
}))

// Starting server
app.listen(3000, function () {
  console.log('Server started on port 3000!')
})

