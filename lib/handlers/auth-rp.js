module.exports = handler

function handler (req, res, next) {
  console.log('In authRp handler:')
  if (req.session.returnToUrl) {
    console.log('  Redirecting to ' + req.session.returnToUrl)
    return res.redirect(302, req.session.returnToUrl)
  }
  res.send('OK')
}
