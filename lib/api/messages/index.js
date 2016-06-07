module.exports = send

function send () {
  return (req, res, next) => {
    if (req.body.to.split(':') === 'mailto') {
      const emailService = req.app.locals.email
      sendEmail(emailService)
    }
  }
}

function sendEmail (emailService) {

  // TODO render template
  // TODO email settings should overwrite default
  // const email = {
  //   from: '"Solid" <no-reply@' + account + '>',
  //   to: email,
  //   subject: 'Recover your account',
  //   text: 'Hello,\n' +
  //     'You asked to retrieve your account: ' + account + '\n' +
  //     'Copy this address in your browser addressbar:\n\n' +
  //     'https://' + path.join(host, '/api/accounts/validateToken?token=' + token) // TODO find a way to get the full url
  //   // html: ''
  // }
  const email = {}

  emailService.sendMail(email, function (err, info) {
    if (err) {
      res.send(500, 'Failed to send the email for account recovery, try again')
      return
    }

    res.send('Requested')
  })
}