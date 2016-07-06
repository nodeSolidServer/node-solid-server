module.exports = handler

function handler (req, res, next) {
  res.header('Accept-Patch', 'application/sparql-update')
  next()
}
