/* eslint-disable no-unused-expressions */

const EmailService = require('../../lib/services/email-service')
const path = require('path')
const sinon = require('sinon')
const chai = require('chai')
const expect = chai.expect
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const templatePath = path.join(__dirname, '../../default-templates/emails')

describe('Email Service', function () {
  describe('EmailService constructor', () => {
    it('should set up a nodemailer instance', () => {
      const templatePath = '../../config/email-templates'
      const config = {
        host: 'smtp.gmail.com',
        auth: {
          user: 'alice@gmail.com',
          pass: '12345'
        }
      }

      const emailService = new EmailService(templatePath, config)
      expect(emailService.mailer.options.host).to.equal('smtp.gmail.com')
      expect(emailService.mailer).to.respondTo('sendMail')

      expect(emailService.templatePath).to.equal(templatePath)
    })

    it('should init a sender address if explicitly passed in', () => {
      const sender = 'Solid Server <solid@databox.me>'
      const config = { host: 'smtp.gmail.com', auth: {}, sender }

      const emailService = new EmailService(templatePath, config)
      expect(emailService.sender).to.equal(sender)
    })

    it('should construct a default sender if not passed in', () => {
      const config = { host: 'databox.me', auth: {} }

      const emailService = new EmailService(templatePath, config)

      expect(emailService.sender).to.equal('no-reply@databox.me')
    })
  })

  describe('sendMail()', () => {
    it('passes through the sendMail call to the initialized mailer', () => {
      const sendMail = sinon.stub().returns(Promise.resolve())
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)

      emailService.mailer.sendMail = sendMail

      const email = { subject: 'Test' }

      return emailService.sendMail(email)
        .then(() => {
          expect(sendMail).to.have.been.calledWith(email)
        })
    })

    it('uses the provided from:, if present', () => {
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)
      const email = { subject: 'Test', from: 'alice@example.com' }

      emailService.mailer.sendMail = (email) => { return Promise.resolve(email) }

      return emailService.sendMail(email)
        .then(email => {
          expect(email.from).to.equal('alice@example.com')
        })
    })

    it('uses the default sender if a from: is not provided', () => {
      const config = { host: 'databox.me', auth: {}, sender: 'solid@example.com' }
      const emailService = new EmailService(templatePath, config)
      const email = { subject: 'Test', from: null }

      emailService.mailer.sendMail = (email) => { return Promise.resolve(email) }

      return emailService.sendMail(email)
        .then(email => {
          expect(email.from).to.equal(config.sender)
        })
    })
  })

  describe('templatePathFor()', () => {
    it('should compose filename based on base path and template name', () => {
      const config = { host: 'databox.me', auth: {} }
      const templatePath = '../../config/email-templates'
      const emailService = new EmailService(templatePath, config)

      const templateFile = emailService.templatePathFor('welcome')

      expect(templateFile.endsWith('email-templates/welcome'))
    })
  })

  describe('readTemplate()', () => {
    it('should read a template if it exists', () => {
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)

      const template = emailService.readTemplate('welcome')

      expect(template).to.respondTo('render')
    })

    it('should throw an error if a template does not exist', () => {
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)

      expect(() => { emailService.readTemplate('invalid-template') })
        .to.throw(/Cannot find email template/)
    })
  })

  describe('sendWithTemplate()', () => {
    it('should reject with error if template does not exist', done => {
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)

      const data = {}

      emailService.sendWithTemplate('invalid-template', data)
        .catch(error => {
          expect(error.message.startsWith('Cannot find email template'))
            .to.be.true
          done()
        })
    })

    it('should render an email from template and send it', () => {
      const config = { host: 'databox.me', auth: {} }
      const emailService = new EmailService(templatePath, config)

      emailService.sendMail = (email) => { return Promise.resolve(email) }
      emailService.sendMail = sinon.spy(emailService, 'sendMail')

      const data = { webid: 'https://alice.example.com#me' }

      return emailService.sendWithTemplate('welcome', data)
        .then(renderedEmail => {
          expect(emailService.sendMail).to.be.called

          expect(renderedEmail.subject).to.exist
          expect(renderedEmail.text.endsWith('Your Web Id: https://alice.example.com#me'))
            .to.be.true
        })
    })
  })
})
