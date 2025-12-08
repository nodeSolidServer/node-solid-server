import nodemailer from 'nodemailer'
import path from 'path'
import debugModule from '../debug.mjs'
import { pathToFileURL } from 'url'

const debug = debugModule.email

class EmailService {
  constructor (templatePath, config) {
    this.mailer = nodemailer.createTransport(config)
    this.sender = this.initSender(config)
    this.templatePath = templatePath
  }

  initSender (config) {
    let sender
    if (config.sender) {
      sender = config.sender
    } else {
      sender = `no-reply@${config.host}`
    }
    return sender
  }

  sendMail (email) {
    email.from = email.from || this.sender
    debug('Sending email to ' + email.to)
    return this.mailer.sendMail(email)
  }

  sendWithTemplate (templateName, data) {
    return Promise.resolve()
      .then(async () => {
        const renderedEmail = await this.emailFromTemplate(templateName, data)
        return this.sendMail(renderedEmail)
      })
  }

  async emailFromTemplate (templateName, data) {
    const template = await this.readTemplate(templateName)
    const renderFn = template.render ?? (typeof template.default === 'function' ? template.default : template.default?.render)
    if (!renderFn) throw new Error('Template does not expose a render function: ' + templateName)
    return Object.assign({}, renderFn(data), data)
  }

  async readTemplate (templateName) {
    // Accept legacy `.js` templateName and prefer `.mjs`
    let name = templateName
    if (name.endsWith('.js')) name = name.replace(/\.js$/, '.mjs')
    const templateFile = this.templatePathFor(name)
    // Try dynamic import for ESM templates first
    try {
      const moduleUrl = pathToFileURL(templateFile).href
      const mod = await import(moduleUrl)
      return mod
    } catch (err) {
      // Fallback: if consumer passed a CommonJS template name (no .mjs), try requiring it
      try {
        const { createRequire } = await import('module')
        const require = createRequire(import.meta.url)
        // If templateName originally had .js, attempt that too
        const cjsTemplateFile = this.templatePathFor(templateName)
        const required = require(cjsTemplateFile)
        return required
      } catch (err2) {
        throw new Error('Cannot find email template: ' + templateFile)
      }
    }
  }

  templatePathFor (templateName) {
    return path.join(this.templatePath, templateName)
  }
}

export default EmailService
