'use strict'

const nodemailer = require('nodemailer')
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

/**
 * Models a Nodemailer-based email sending service.
 *
 * @see https://nodemailer.com/about/
 */
class EmailService {
  /**
   * @constructor
   * @param config {Object} Nodemailer configuration object
   * @see https://nodemailer.com/smtp/
   *
   * Transport SMTP config options:
   * @param config.host {string} e.g. 'smtp.gmail.com'
   * @param config.port {string} e.g. '465'
   * @param config.secure {boolean} Whether to use TLS when connecting to server
   *
   * Transport authentication config options:
   * @param config.auth {Object}
   * @param config.auth.user {string} Smtp username (e.g. 'alice@gmail.com')
   * @param config.auth.pass {string} Smtp password
   *
   * Optional default Sender / `from:` address:
   * @param [config.sender] {string} e.g. 'Solid Server <no-reply@databox.me>'
   */
  constructor (config) {
    this.mailer = nodemailer.createTransport(config)

    this.sender = this.initSender(config)

    this.templates = config.templates || {}
  }

  /**
   * Returns the default Sender address based on config.
   *
   * Note that if using Gmail for SMTP transport, Gmail ignores the sender
   * `from:` address and uses the SMTP username instead (`auth.user`).
   *
   * @param config {Object}
   *
   * The sender is derived from either:
   * @param [config.sender] {string} e.g. 'Solid Server <no-reply@databox.me>'
   *
   * or, if explicit sender is not passed in, uses:
   * @param [config.host] {string} SMTP host from transport config
   *
   * @return {string} Sender `from:` address
   */
  initSender (config) {
    let sender

    if (config.sender) {
      sender = config.sender
    } else {
      sender = `no-reply@${config.host}`
    }

    return sender
  }

  /**
   * Sends an email (passes it through to nodemailer).
   *
   * @param email {Object}
   *
   * @return {Promise<EmailResponse>}
   */
  sendMail (email) {
    return this.mailer.sendMail(email)
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
    this.readTemplate(this.templates.messagePath, defaultMessage, cb)
  }
}

module.exports = EmailService
