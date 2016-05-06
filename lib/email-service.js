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
  sendMail (email, callback) {
    console.log(this.mailer)
    this.mailer.sendMail(email, callback)
  }
}

module.exports = EmailService
