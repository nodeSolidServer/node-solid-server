module.exports = AccountRecovery

var express = require('express')
var bodyParser = require('body-parser')
var parser = bodyParser.urlencoded({ extended: false })
var uid = require('uid-safe').sync
var moment = require('moment')
var nodemailer = require('nodemailer')
var path = require('path')

function TokenService () {
  this._tokens = {}
}

TokenService.prototype.generateToken = function (account) {
  var token = uid(20)
  this._tokens[token] = {account: account, expire: moment().add(20, 'minutes')}
  return token
}

TokenService.prototype.verifyToken = function (token) {
  var now = new Date()
  if (this._tokens[token] && now < this._tokens[token].expire) {
    return this._tokens[token].account
  } else {
    return false
  }
}

TokenService.prototype.removeToken = function (token) {
  delete this._tokens[token]
}

// options.corsSettings
// options.mailer
// options.email
function AccountRecovery (options) {
  options = options || {}

  var router = express.Router('/')

  if (options.corsSettings) {
    router.use(options.corsSettings)
  }

  var tokenService = new TokenService()
  var emailService = nodemailer.createTransport(options.mailer)

  var sendEmail = function (host, account, email, token, callback) {
    var defaultEmail = {
      from: '"Account Recovery" <no-reply@' + account + '>',
      to: email,
      subject: 'Recover your account',
      text: 'Hello,\n' +
        'You asked to retrieve your account: ' + account + '\n' +
        'Copy this address in your browser addressbar:\n\n' +
        'https://' + path.join(host, '/confirm?token=' + token) // TODO find a way to get the full url
      // html: ''
    }

    emailService.sendEmail(defaultEmail, callback)
  }

  router.post('/request', parser, function (res, req, next) {
    var ldp = req.app.locals.ldp

    if (!req.body.account) {
      res.send(406)
      return
    }

    // Check if account exists
    ldp.graph(req.body.account, '/' + ldp.suffixAcl, function (err, graph) {
      if (err) {
        res.send(err.status, 'Fail to find user')
        return
      }
      // TODO do a query
      // graph.match(undefined, 'http://www.w3.org/ns/auth/acl#agent')
      // email
      var token = tokenService.generateToken(req.body.account)
      sendEmail(req.get('host'), req.body.account, email, token, function (err, info) {
        if (err) {
          res.send(500, 'Failed to send the email for account recovery')
          return
        }

        res.send('Requested')
      })
    })
  })

  router.get('/confirm', function (res, req, next) {
    if (!req.query.token) {
      res.send(406, 'Token is required')
      return
    }

    var account = tokenService.verifyToken(req.query.token)
    if (!account) {
      res.send(401, 'Token not valid')
      return
    }

    // Check if account exists
    tokenService.removeToken(req.query.token)

    req.session.userId = account // TODO add the full path
    req.session.identified = true
    res.set('User', req.session.userId)
    res.redirect(options.redirect)
  })

  return router
}
