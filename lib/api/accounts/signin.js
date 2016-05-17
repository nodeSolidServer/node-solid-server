module.exports = signin

const validUrl = require('valid-url')
const request = require('request')
const li = require('li')

function signin () {
  return (req, res, next) => {
    if (!validUrl.isUri(req.body.webid)) {
      return res.status(400).send('This is not a valid URI')
    }

    request({ method: 'OPTIONS', uri: req.body.webid }, function (err, req) {
      if (err) {
        res.status(400).send('Did not find a valid endpoint')
        return
      }
      if (!req.headers.link) {
        res.status(400).send('The URI requested is not a valid endpoint')
        return
      }

      const linkHeaders = li.parse(req.headers.link)
      console.log(linkHeaders)
      if (!linkHeaders['oidc.issuer']) {
        res.status(400).send('The URI requested is not a valid endpoint')
        return
      }

      res.redirect(linkHeaders['oidc.issuer'])
    })
  }
}
