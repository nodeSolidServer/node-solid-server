import { URL } from 'url'
import { Agent } from 'undici'

const insecureDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false
  }
})

export default function get (webid, callback) {
  let uri
  try {
    uri = new URL(webid)
  } catch (err) {
    return callback(new Error('Invalid WebID URI: ' + webid + ': ' + err.message))
  }
  const headers = {
    Accept: 'text/turtle, application/ld+json'
  }
  const options = { method: 'GET', headers }
  if (uri.protocol === 'https:' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    options.dispatcher = insecureDispatcher
  }
  fetch(uri.href, options)
    .then(async res => {
      if (!res.ok) {
        return callback(new Error('Failed to retrieve WebID from ' + uri.href + ': HTTP ' + res.status))
      }
      const contentType = res.headers.get('content-type')
      let body
      if (contentType && contentType.includes('json')) {
        body = JSON.stringify(await res.json(), null, 2)
      } else {
        body = await res.text()
      }
      callback(null, body, contentType)
    })
    .catch(err => {
      return callback(new Error('Failed to fetch profile from ' + uri.href + ': ' + err))
    })
}
