'use strict'

const nodemailer = require('nodemailer')
const extend = require('extend')
const fs = require('fs')

const defaultWelcome = {
  subject: 'Welcome to Solid {{name}}',
  text: 'Your account has been created at the following webid: {{webid}}',
  html: '<b>Your account has been created at the following webid: {{webid}}</b>'
}

const defaultMessage = {
  subject: 'Message from {{me}}',
  text: 'You have received a message from {{me}}:\n{{message}}',
  html: '<p>You have received a message from<strong>{{me}}</strong></p><p>{{message}}</p>'
}

class EmailService {
  constructor (settings = {}) {
    // This reflects nodemailer string option, we allow it
    if (typeof settings !== 'string') {
      settings = extend(settings, {secure: true})
    }
    this.mailer = nodemailer.createTransport(settings)

    if (settings.sender) {
      this.sender = settings.sender
    } else if (settings.host) {
      this.sender = `no-reply@${settings.host}`
    }

    this.templates = settings.templates || {}
  }
  sendMail (email, callback) {
    this.mailer.sendMail(email, callback)
  }

  readTemplate (path, defaultTemplate, cb) {
    if (!path) {
      return cb(defaultTemplate)
    }

    fs.readFile(path, function (err, data) {
      if (err) return cb(defaultTemplate)
      let json
      try {
        json = JSON.parse(data)
      } catch (e) {
        cb(defaultTemplate)
      }

      cb(json)
    })
  }

  welcomeTemplate (cb) {
    this.readTemplate(this.templates.welcomePath, defaultWelcome, cb)
  }

  messageTemplate (cb) {
    this.readTemplate(this.templates.messatePath, defaultMessage, cb)
  }
}

module.exports = EmailService
