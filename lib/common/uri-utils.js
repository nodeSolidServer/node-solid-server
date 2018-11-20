module.exports.getFullUriFromRequest = getFullUriFromRequest

function getFullUriFromRequest (req) {
  return req.protocol + '://' + req.get('host') + req.originalUrl
}
