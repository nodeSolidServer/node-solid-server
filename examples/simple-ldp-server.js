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
var ldp = ldnode({
  uri: 'http://localhost:3000/ldp'
})
var ldp1 = ldnode({
  uri: 'http://localhost:3000/ldp/asd'
})
ldp.get('/jj', function (req, res) {
  res.send(req.hostname + '\n' + req.baseUrl)
  console.log(req.ip)
})
ldp1.get('/jj', function (req, res) {
  res.send(req.hostname + '\n' + req.baseUrl)
  console.log(req.ip)
})
ldp.use('/asd', ldp1)
app.use('/ldp', ldp)

// Starting server
app.listen(3000, function () {
  console.log('Server started on port 3000!')
})

