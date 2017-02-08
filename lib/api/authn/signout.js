module.exports = signout

function signout () {
  return (req, res, next) => {
    req.session.userId = ''
    req.session.identified = false
    res.status(200).send()
  }
}
