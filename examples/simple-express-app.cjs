const express = require('express')
const solid = require('../') // or require('solid')

// Starting our express app
const app = express()

// My routes
app.get('/', function (req, res) {
  console.log(req)
  res.send('Welcome to my server!')
})

// Mounting solid on /ldp
const ldp = solid()
app.use('/ldp', ldp)

// Starting server
app.listen(3000, function () {
  console.log('Server started on port 3000!')
})
