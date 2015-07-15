var express = require('express')
var ldnode = require('../') // or require('ldnode')

// Starting our express app
var app = express()

// My routes
app.get('/', function (req, res) {
  console.log(req)
  res.send('Welcome to my server!')
})

// Mounting ldnode on /ldp
var ldp = ldnode()
app.use('/ldp', ldp)

// Starting server
app.listen(3000, function () {
  console.log('Server started on port 3000!')
})

