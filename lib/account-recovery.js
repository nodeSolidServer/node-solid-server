module.exports = AccountRecovery

var express = require('express')
var bodyParser = require('body-parser')
var parser = bodyParser.urlencoded({ extended: false })
var forge = require('node-forge')
var uuid = require('uuid')
var uid = require('uid-safe').sync
var hmac = require('cookie-signature')

function AccountRecovery (options) {
  options = options || {}

  var router = express.Router('/')

  if (options.corsSettings) {
    router.use(options.corsSettings)
  }
  if (!options.secret) {
    options.secret = uuid.v4()
  }

  var generateToken = function (account) {
    // TODO encrypt account with date (server private key)
    // var md = forge.md.sha1.create();
    // var privateKey = options.keys.privateKey
    // md.update(req.body.account + '|' + (new Date()).getTime(), 'utf8')
    // var cipherText = privateKey.encrypt(md)

    // avoid doing this, using hmac instead
    return token
  }

  var verifyToken = function (token) {
    return result
  }

  router.post('/request', parser, function (res, req, next) {
    if (!req.body.account) {
      res.send(406)
      return
    }

    var token = generateToken(req.body.account)
    sendEmail(req.body.account, token)
    res.send('Requested')
  })

  router.get('/confirm', function (res, req, next) {
    if (!req.query.token) {
      res.send(406, 'Token is required')
      return
    }

    var result = verifyToken(req.query.token)
    if (!result) {
      res.send(401, 'Token not valid')
      return
    }

    req.session.userId = // TODO get id from request
    req.session.identified = true
    res.set('User', req.session.userId)
    res.redirect(options.redirect)
  })

  return router
}

function sendEmail (account) {
  // find email in ACL
  // send email using a library
}

