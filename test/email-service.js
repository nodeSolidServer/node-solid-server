const EmailService = require('../lib/models/email-service')
const sinon = require('sinon')
const chai = require('chai')
const expect = chai.expect
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

describe('Email Service', function () {
  describe('EmailService constructor', () => {
    it('should set up a nodemailer instance', () => {
      let config = {
        host: 'smtp.gmail.com',
        auth: {
          user: 'alice@gmail.com',
          pass: '12345'
        }
      }

      let emailService = new EmailService(config)
      expect(emailService.mailer.options.host).to.equal('smtp.gmail.com')
      expect(emailService.mailer).to.respondTo('sendMail')
    })

    it('should init a sender address if explicitly passed in', () => {
      let sender = 'Solid Server <solid@databox.me>'
      let config = { host: 'smtp.gmail.com', auth: {}, sender }

      let emailService = new EmailService(config)
      expect(emailService.sender).to.equal(sender)
    })

    it('should construct a default sender if not passed in', () => {
      let config = { host: 'databox.me', auth: {} }

      let emailService = new EmailService(config)

      expect(emailService.sender).to.equal('no-reply@databox.me')
    })
  })

  describe('sendMail()', () => {
    it('passes through the sendMail call to the initialized mailer', () => {
      let sendMail = sinon.stub().returns(Promise.resolve())
      let config = { host: 'databox.me', auth: {} }
      let emailService = new EmailService(config)

      emailService.mailer.sendMail = sendMail

      let email = { subject: 'Test' }

      return emailService.sendMail(email)
        .then(() => {
          expect(sendMail).to.have.been.calledWith(email)
        })
    })
  })
})
