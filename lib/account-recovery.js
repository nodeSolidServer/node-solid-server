module.exports = AccountRecovery

const express = require('express')
const TokenService = require('./token-service')
const bodyParser = require('body-parser')
const path = require('path')

function AccountRecovery (options = {}) {
  var router = express.Router('/')
  const tokenService = new TokenService()
  const generateEmail = function (host, account, email, token) {
    return {
      from: '"Account Recovery" <no-reply@' + account + '>',
      to: email,
      subject: 'Recover your account',
      text: 'Hello,\n' +
        'You asked to retrieve your account: ' + account + '\n' +
        'Copy this address in your browser addressbar:\n\n' +
        'https://' + path.join(host, '/confirm?token=' + token) // TODO find a way to get the full url
      // html: ''
    }
  }

  if (options.corsSettings) {
    router.use(options.corsSettings)
  }

  router.post('/request', bodyParser.urlencoded({ extended: false }), function (req, res, next) {
    const ldp = req.app.locals.ldp
    const emailService = req.app.locals.email

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
      let emailAddress
      graph
        .match(undefined, 'http://www.w3.org/ns/auth/acl#agent')
        .some(function (statement) {
          if (statement.object.beginsWith('mailto:')) {
            emailAddress = statement.object
            return true
          }
        })

      if (!emailAddress) {
        res.send(406, 'No emailAddress registered in your account')
        return
      }

      const token = tokenService.generateToken(req.body.account)
      const email = generateEmail(req.get('host'), req.body.account, emailAddress, token)
      emailService.sendMail(email, function (err, info) {
        if (err) {
          res.send(500, 'Failed to send the email for account recovery, try again')
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

    var tokenContent = tokenService.verifyToken(req.query.token)
    if (tokenContent && !tokenContent.account) {
      res.send(401, 'Token not valid')
      return
    }

    tokenService.removeToken(req.query.token)

    req.session.userId = tokenContent.account // TODO add the full path
    req.session.identified = true
    res.set('User', tokenContent.account)
    res.redirect(options.redirect)
  })

  return router
}
