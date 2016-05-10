'use strict'

const nodemailer = require('nodemailer')
const extend = require('extend')

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
  }
  sendMail (email, callback) {
    this.mailer.sendMail(email, callback)
  }
}

module.exports = EmailService
