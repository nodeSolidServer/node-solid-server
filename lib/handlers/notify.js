module.exports = handler

function handler (req, res, next) {
  res.events.prep.trigger({
    generateNotifications () {
      return res.events.prep.defaultNotification({
        ...(res.method === 'POST') && { location: res.getHeader('Content-Location') }
      })
    }
  })
  next()
}
