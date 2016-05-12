module.exports = signin

const validUrl = require('valid-url')
const request = require('request')
const li = require('li')

function signin () {
  return (req, res, next) => {
    if (!validUrl.isUri(req.body.webid)) {
      return res.status(400).send('This is not a valid URI')
    }

    let ldp = req.app.locals.ldp
    if (ldp.auth !== 'oidc') {
      res
        .status(500)
        .send('Not implemented')
      return
    }

    request({ method: 'OPTIONS', uri: req.body.webid }, function (err, response) {
      if (err) {
        res.status(400).send('Did not find a valid endpoint')
        return
      }
      if (!response.headers.link) {
        res.status(400).send('The URI requested is not a valid endpoint')
        return
      }

      const linkHeaders = li.parse(response.headers.link)
      console.log(linkHeaders)
      if (!linkHeaders['oidc.issuer']) {
        res.status(400).send('The URI requested is not a valid endpoint')
        return
      }
      let issuer = linkHeaders['oidc.issuer']

      // load the client for the issuer
      let oidcRpClient = req.app.locals.oidc
      oidcRpClient.authUrlForIssuer(issuer)
        .then((authUrl) => {
          res.redirect(authUrl)
        })
        .catch(next)
    })
  }
}
