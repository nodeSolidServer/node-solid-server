module.exports = handler

const rfc822Template = require('express-prep/templates').rfc822

function handler (req, res, next) {
  res.events.prep.trigger({
    generateNotifications: () => `\r\n${rfc822Template({ res })}`
  })
  next()
}
