module.exports = webid

const tls = require('./tls')

function webid (type) {
  type = type || 'tls'

  if (type === 'tls') {
    return tls
  }

  throw new Error('No other WebID supported')
}
