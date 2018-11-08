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
      let templatePath = '../../config/email-templates'
      let config = {
        host: 'smtp.gmail.com',
        auth: {
          user: 'alice@gmail.com',
          pass: '12345'
        }
      }

      let emailService = new EmailService(templatePath, config)
      expect(emailService.mailer.options.host).to.equal('smtp.gmail.com')
      expect(emailService.mailer).to.respondTo('sendMail')

      expect(emailService.templatePath).to.equal(templatePath)
    })

    it('should init a sender address if explicitly passed in', () => {
      let sender = 'Solid Server <solid@databox.me>'
      let config = { host: 'smtp.gmail.com', auth: {}, sender }

      let emailService = new EmailService(templatePath, config)
      expect(emailService.sender).to.equal(sender)
    })

    it('should construct a default sender if not passed in', () => {
      let config = { host: 'databox.me', auth: {} }

      let emailService = new EmailService(templatePath, config)

      expect(emailService.sender).to.equal('no-reply@databox.me')
    })
  })

  describe('sendMail()', () => {
    it('passes through the sendMail call to the initialized mailer', () => {
      let sendMail = sinon.stub().returns(Promise.resolve())
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)

      emailService.mailer.sendMail = sendMail

      let email = { subject: 'Test' }

      return emailService.sendMail(email)
        .then(() => {
          expect(sendMail).to.have.been.calledWith(email)
        })
    })

    it('uses the provided from:, if present', () => {
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)
      let email = { subject: 'Test', from: 'alice@example.com' }

      emailService.mailer.sendMail = (email) => { return Promise.resolve(email) }

      return emailService.sendMail(email)
        .then(email => {
          expect(email.from).to.equal('alice@example.com')
        })
    })

    it('uses the default sender if a from: is not provided', () => {
      let config = { host: 'databox.me', auth: {}, sender: 'solid@example.com' }
      let emailService = new EmailService(templatePath, config)
      let email = { subject: 'Test', from: null }

      emailService.mailer.sendMail = (email) => { return Promise.resolve(email) }

      return emailService.sendMail(email)
        .then(email => {
          expect(email.from).to.equal(config.sender)
        })
    })
  })

  describe('templatePathFor()', () => {
    it('should compose filename based on base path and template name', () => {
      let config = { host: 'databox.me', auth: {} }
      let templatePath = '../../config/email-templates'
      let emailService = new EmailService(templatePath, config)

      let templateFile = emailService.templatePathFor('welcome')

      expect(templateFile.endsWith('email-templates/welcome'))
    })
  })

  describe('readTemplate()', () => {
    it('should read a template if it exists', () => {
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)

      let template = emailService.readTemplate('welcome')

      expect(template).to.respondTo('render')
    })

    it('should throw an error if a template does not exist', () => {
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)

      expect(() => { emailService.readTemplate('invalid-template') })
        .to.throw(/Cannot find email template/)
    })
  })

  describe('sendWithTemplate()', () => {
    it('should reject with error if template does not exist', done => {
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)

      let data = {}

      emailService.sendWithTemplate('invalid-template', data)
        .catch(error => {
          expect(error.message.startsWith('Cannot find email template'))
            .to.be.true
          done()
        })
    })

    it('should render an email from template and send it', () => {
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(templatePath, config)

      emailService.sendMail = (email) => { return Promise.resolve(email) }
      emailService.sendMail = sinon.spy(emailService, 'sendMail')

      let data = { webid: 'https://alice.example.com#me' }

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
