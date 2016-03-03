module.exports = AccountRecovery

var express = require('express')
var bodyParser = require('body-parser')
var errorHandler = require('./handlers/error-pages')

function AccountRecovery (options) {
  if (!(this instanceof AccountRecovery)) {
    return new AccountRecovery(options)
  }
  this.redirect = options.redirect
}

AccountRecovery.prototype.middleware = function (corsSettings) {
  var router = express.Router('/')
  var parser = bodyParser.urlencoded({ extended: false })
  var self = this

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.post('/request', parser, function (res, req, next) {
    // req.body.account
    // TODO encrypt account with date (server private key)
    res.send('Requested')
  })

  router.get('/confirm', function (res, req, next) {
    // if (req.query.token decrypt it with public) {
    // }
    // req.session.userId = // TODO get id from request
    // req.session.identified = true
    // debug('Identified user via token: ' + req.session.userId)
    // res.set('User', req.session.userId)
    // TODO delete token
    res.redirect(self.redirect)
  })
  router.use(errorHandler)

  return router
}

