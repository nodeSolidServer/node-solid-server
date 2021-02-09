module.exports = get

const request = require('request')
const url = require('url')

function get (webid, callback) {
  const uri = url.URL(webid)
  const options = {
    url: uri,
    method: 'GET',
    headers: {
      Accept: 'text/turtle, application/ld+json'
    }
  }

  request(options, function (err, res, body) {
    if (err) {
      return callback(new Error('Failed to fetch profile from ' + uri.href + ': ' + err))
    }

    if (res.statusCode !== 200) {
      return callback(new Error('Failed to retrieve WebID from ' + uri.href + ': HTTP ' + res.statusCode))
    }

    callback(null, body, res.headers['content-type'])
  })
}
