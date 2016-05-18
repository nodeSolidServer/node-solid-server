module.exports = AccountRecovery

const express = require('express')
const TokenService = require('./token-service')
const bodyParser = require('body-parser')
const path = require('path')
const debug = require('debug')('solid:account-recovery')
const utils = require('./utils')
const sym = require('rdflib').sym
const url = require('url')

function AccountRecovery (options = {}) {
  const router = express.Router('/')
  const tokenService = new TokenService()
  const generateEmail = function (host, account, email, token) {
    return {
      from: '"Account Recovery" <no-reply@' + account + '>',
      to: email,
      subject: 'Recover your account',
      text: 'Hello,\n' +
        'You asked to retrieve your account: ' + account + '\n' +
        'Copy this address in your browser addressbar:\n\n' +
        'https://' + path.join(host, '/api/accounts/validateToken?token=' + token) // TODO find a way to get the full url
      // html: ''
    }
  }

  router.get('/recover', function (req, res, next) {
    res.set('Content-Type', 'text/html')
    res.sendFile(path.join(__dirname, '../static/account-recovery.html'))
  })

  router.post('/recover', bodyParser.urlencoded({ extended: false }), function (req, res, next) {
    debug('getting request for account recovery', req.body.webid)
    const ldp = req.app.locals.ldp
    const emailService = req.app.locals.email
    const baseUri = utils.uriAbs(req)

    // if (!req.body.webid) {
    //   res.status(406).send('You need to pass an account')
    //   return
    // }

    // Check if account exists
    let webid = url.parse(req.body.webid)
    let hostname = webid.hostname

    ldp.graph(hostname, '/' + ldp.suffixAcl, baseUri, function (err, graph) {
      if (err) {
        debug('cannot find graph of the user', req.body.webid || ldp.root, err)
        res.status(err.status || 500).send('Fail to find user')
        return
      }

      // TODO do a query
      let emailAddress
      graph
        .statementsMatching(undefined, sym('http://www.w3.org/ns/auth/acl#agent'))
        .some(function (statement) {
          if (statement.object.uri.startsWith('mailto:')) {
            emailAddress = statement.object.uri
            return true
          }
        })

      if (!emailAddress) {
        res.status(406).send('No emailAddress registered in your account')
        return
      }

      const token = tokenService.generate({ webid: req.body.webid })
      const email = generateEmail(req.get('host'), req.body.webid, emailAddress, token)
      emailService.sendMail(email, function (err, info) {
        if (err) {
          res.send(500, 'Failed to send the email for account recovery, try again')
          return
        }

        res.send('Requested')
      })
    })
  })

  router.get('/validateToken', function (req, res, next) {
    if (!req.query.token) {
      res.status(406).send('Token is required')
      return
    }

    const tokenContent = tokenService.verify(req.query.token)

    if (!tokenContent) {
      debug('token was not found', tokenContent)
      res.status(401).send('Token not valid')
      return
    }

    if (tokenContent && !tokenContent.webid) {
      debug('token does not match account', tokenContent)
      res.status(401).send('Token not valid')
      return
    }

    debug('token was valid', tokenContent)

    tokenService.remove(req.query.token)

    req.session.userId = tokenContent.webid // TODO add the full path
    req.session.identified = true
    res.set('User', tokenContent.webid)
    res.redirect(options.redirect)
  })

  return router
}
