'use strict'

const nodemailer = require('nodemailer')
const path = require('path')
const debug = require('../debug').email

/**
 * Models a Nodemailer-based email sending service.
 *
 * @see https://nodemailer.com/about/
 */
class EmailService {
  /**
   * @constructor
   *
   * @param templatePath {string} Path to the email templates directory
   *
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
  constructor (templatePath, config) {
    this.mailer = nodemailer.createTransport(config)

    this.sender = this.initSender(config)

    this.templatePath = templatePath
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
    email.from = email.from || this.sender

    debug('Sending email to ' + email.to)
    return this.mailer.sendMail(email)
  }

  /**
   * Sends an email using a saved email template.
   * Usage:
   *
   *    ```
   *    let data = { webid: 'https://example.com/alice#me', ... }
   *
   *    emailService.sendWithTemplate('welcome', data)
   *      .then(response => {
   *        // email sent using the 'welcome' template
   *      })
   *    ```
   *
   * @param templateName {string} Name of a template file in the email-templates
   *   dir, no extension necessary.
   *
   * @param data {Object} Key/value hashmap of data for an email template.
   *
   * @return {Promise<EmailResponse>}
   */
  sendWithTemplate (templateName, data) {
    return Promise.resolve()
      .then(() => {
        let renderedEmail = this.emailFromTemplate(templateName, data)

        return this.sendMail(renderedEmail)
      })
  }

  /**
   * Returns an email from a rendered template.
   *
   * @param templateName {string}
   * @param data {Object} Key/value hashmap of data for an email template.
   *
   * @return {Object} Rendered email object from template
   */
  emailFromTemplate (templateName, data) {
    let template = this.readTemplate(templateName)

    return Object.assign({}, template.render(data), data)
  }

  /**
   * Reads (requires) and returns the contents of an email template file, for
   * a given template name.
   *
   * @param templateName {string}
   *
   * @throws {Error} If the template could not be found
   *
   * @return {Object}
   */
  readTemplate (templateName) {
    let templateFile = this.templatePathFor(templateName)
    let template

    try {
      template = require(templateFile)
    } catch (error) {
      throw new Error('Cannot find email template: ' + templateFile)
    }

    return template
  }

  /**
   * Returns a template file path for a given template name.
   *
   * @param templateName {string}
   *
   * @return {string}
   */
  templatePathFor (templateName) {
    return path.join(this.templatePath, templateName)
  }
}

module.exports = EmailService
