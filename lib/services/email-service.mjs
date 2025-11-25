import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import debugModule from '../debug.mjs';

const debug = debugModule.email;

class EmailService {
  constructor(templatePath, config) {
    this.mailer = nodemailer.createTransport(config);
    this.sender = this.initSender(config);
    this.templatePath = templatePath;
  }
  initSender(config) {
    let sender;
    if (config.sender) {
      sender = config.sender;
    } else {
      sender = `no-reply@${config.host}`;
    }
    return sender;
  }
  sendMail(email) {
    email.from = email.from || this.sender;
    debug('Sending email to ' + email.to);
    return this.mailer.sendMail(email);
  }
  sendWithTemplate(templateName, data) {
    return Promise.resolve()
      .then(() => {
        const renderedEmail = this.emailFromTemplate(templateName, data);
        return this.sendMail(renderedEmail);
      });
  }
  emailFromTemplate(templateName, data) {
    const template = this.readTemplate(templateName);
    return Object.assign({}, template.render(data), data);
  }
  readTemplate(templateName) {
    const templateFile = this.templatePathFor(templateName);
    let template;
    try {
      template = fs.readFileSync(templateFile, 'utf-8');
    } catch (error) {
      throw new Error('Cannot find email template: ' + templateFile)
    }
    return template;
  }
  templatePathFor(templateName) {
    return path.join(this.templatePath, templateName);
  }
}

export default EmailService;
