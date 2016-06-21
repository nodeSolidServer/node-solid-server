'use strict'

const nodemailer = require('nodemailer')
const extend = require('extend')

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

  welcomeTemplate () {
    return this.templates.welcome || defaultWelcome
  }

  messageTemplate () {
    return this.templates.message || defaultMessage
  }
}

module.exports = EmailService
