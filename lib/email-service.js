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
  }
  sendEmail (email, callback) {
    this.mailer.sendEmail(email, callback)
  }
}

module.exports = EmailService
