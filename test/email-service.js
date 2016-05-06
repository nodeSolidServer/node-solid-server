const EmailService = require('../lib/email-service')
const sinon = require('sinon')
const expect = require('chai').expect

describe('Email Service', function () {
  let email, transport

  beforeEach(() => {
    transport = {
      name: 'testsend',
      version: '1',
      send: function (data, callback) {
        callback();
      },
      logger: false
    }
    email = new EmailService(transport)
  })

  it('should send emails', (done) => {
    sinon.stub(transport, 'send').yields(null, 'bep bop')

    email.sendMail({
      subject: 'test'
    }, function (err, info) {
      expect(err).to.not.exist;
      expect(info).to.equal('bep bop')
      done()
    })
  })
})
