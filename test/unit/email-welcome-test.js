'use strict'
/* eslint-disable no-unused-expressions */

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const EmailService = require('../../lib/services/email-service')

const templatePath = path.join(__dirname, '../../default-templates/emails')

var host, accountManager, emailService

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })

  const emailConfig = { auth: {}, sender: 'solid@example.com' }
  emailService = new EmailService(templatePath, emailConfig)

  const mgrConfig = {
    host,
    emailService,
    authMethod: 'oidc',
    multiuser: true
  }
  accountManager = AccountManager.from(mgrConfig)
})

describe('Account Creation Welcome Email', () => {
  describe('accountManager.sendWelcomeEmail() (unit tests)', () => {
    it('should resolve to null if email service not set up', () => {
      accountManager.emailService = null

      const userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      const newUser = accountManager.userAccountFrom(userData)

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(result).to.be.null
        })
    })

    it('should resolve to null if a new user has no email', () => {
      const userData = { name: 'Alice', username: 'alice' }
      const newUser = accountManager.userAccountFrom(userData)

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(result).to.be.null
        })
    })

    it('should send an email using the welcome template', () => {
      const sendWithTemplate = sinon
        .stub(accountManager.emailService, 'sendWithTemplate')
        .returns(Promise.resolve())

      const userData = { name: 'Alice', username: 'alice', email: 'alice@alice.com' }
      const newUser = accountManager.userAccountFrom(userData)

      const expectedEmailData = {
        webid: 'https://alice.example.com/profile/card#me',
        to: 'alice@alice.com',
        name: 'Alice'
      }

      return accountManager.sendWelcomeEmail(newUser)
        .then(result => {
          expect(sendWithTemplate).to.be.calledWith('welcome', expectedEmailData)
        })
    })
  })
})
