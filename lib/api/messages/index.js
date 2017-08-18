exports.send = send

const error = require('../../http-error')
const debug = require('debug')('solid:api:messages')
const utils = require('../../utils')
const sym = require('rdflib').sym
const url = require('url')
const waterfall = require('run-waterfall')

function send () {
  return (req, res, next) => {
    if (!req.session.userId) {
      next(error(401, 'You need to be authenticated'))
      return
    }

    if (!req.body.message || req.body.message.length < 0) {
      next(error(406, 'You need to specify a message'))
      return
    }

    if (!req.body.to) {
      next(error(406, 'You need to specify a the destination'))
      return
    }

    if (req.body.to.split(':').length !== 2) {
      next(error(406, 'Destination badly formatted'))
      return
    }

    waterfall([
      (cb) => getLoggedUserName(req, cb),
      (displayName, cb) => {
        const vars = {
          me: displayName,
          message: req.body.message
        }

        if (req.body.to.split(':') === 'mailto' && req.app.locals.emailService) {
          sendEmail(req, vars, cb)
        } else {
          cb(error(406, 'Messaging service not available'))
        }
      }
    ], (err) => {
      if (err) {
        next(err)
        return
      }

      res.send('message sent')
    })
  }
}

function getLoggedUserName (req, callback) {
  const ldp = req.app.locals.ldp
  const baseUri = utils.getBaseUri(req)
  const webid = url.parse(req.session.userId)

  ldp.graph(webid.hostname, '/' + webid.pathname, baseUri, function (err, graph) {
    if (err) {
      debug('cannot find graph of the user', req.session.userId || ldp.root, err)
      // TODO for now only users of this IDP can send emails
      callback(error(403, 'Your user cannot perform this operation'))
      return
    }

    // TODO do a query
    let displayName
    graph
      .statementsMatching(undefined, sym('http://xmlns.com/foaf/0.1/name'))
      .some(function (statement) {
        if (statement.object.value) {
          displayName = statement.object.value
          return true
        }
      })

    if (!displayName) {
      displayName = webid.hostname
    }
    callback(null, displayName)
  })
}

function sendEmail (req, vars, callback) {
  const emailService = req.app.locals.emailService
  const emailData = {
    from: 'no-reply@' + webid.hostname,
    to: req.body.to.split(':')[1]
  }
  const webid = url.parse(req.session.userId)

  emailService.messageTemplate((template) => {
    var send = emailService.mailer.templateSender(
      template,
      { from: emailData.from })

    // use template based sender to send a message
    send({ to: emailData.to }, vars, callback)
  })
}
