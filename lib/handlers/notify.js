module.exports = handler

function handler (req, res, next) {
  res.events.prep.trigger({
    generateNotifications: () => `\r\n${res.events.prep.defaultNotification({
      ...(res.method === 'POST') && { location: res.getHeader('Content-Location') }
    })}`
  })
  next()
}
