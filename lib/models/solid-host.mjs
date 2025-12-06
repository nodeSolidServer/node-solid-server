import url from 'url'
import defaults from '../../config/defaults.mjs'

class SolidHost {
  constructor (options = {}) {
    this.port = options.port || defaults.port
    this.serverUri = options.serverUri || defaults.serverUri
    this.parsedUri = url.parse(this.serverUri)
    this.host = this.parsedUri.host
    this.hostname = this.parsedUri.hostname
    this.live = options.live
    this.root = options.root
    this.multiuser = options.multiuser
    this.webid = options.webid
  }

  static from (options = {}) {
    return new SolidHost(options)
  }

  accountUriFor (accountName) {
    if (!accountName) {
      throw TypeError('Cannot construct uri for blank account name')
    }
    if (!this.parsedUri) {
      throw TypeError('Cannot construct account, host not initialized with serverUri')
    }
    return this.parsedUri.protocol + '//' + accountName + '.' + this.host
  }

  allowsSessionFor (userId, origin, trustedOrigins) {
    if (!userId || !origin) return true
    const originHost = getHostName(origin)
    const serverHost = getHostName(this.serverUri)
    if (originHost === serverHost) return true
    if (originHost.endsWith('.' + serverHost)) return true
    const userHost = getHostName(userId)
    if (originHost === userHost) return true
    if (trustedOrigins.includes(origin)) return true
    return false
  }

  get authEndpoint () {
    const authUrl = url.resolve(this.serverUri, '/authorize')
    return url.parse(authUrl)
  }

  get cookieDomain () {
    let cookieDomain = null
    if (this.hostname.split('.').length > 1) {
      cookieDomain = '.' + this.hostname
    }
    return cookieDomain
  }
}

function getHostName (urlStr) {
  const match = urlStr.match(/^\w+:\/*([^/]+)/)
  return match ? match[1] : ''
}

export default SolidHost
