import url from 'url'

class UserAccount {
  constructor (options = {}) {
    this.username = options.username
    this.webId = options.webId
    this.name = options.name
    this.email = options.email
    this.externalWebId = options.externalWebId
    this.localAccountId = options.localAccountId
    this.idp = options.idp
  }

  static from (options = {}) {
    return new UserAccount(options)
  }

  get displayName () {
    return this.name || this.username || this.email || 'Solid account'
  }

  get id () {
    if (!this.webId) { return null }
    const parsed = url.parse(this.webId)
    let id = parsed.host + parsed.pathname
    if (parsed.hash) {
      id += parsed.hash
    }
    return id
  }

  get accountUri () {
    if (!this.webId) { return null }
    const parsed = url.parse(this.webId)
    return parsed.protocol + '//' + parsed.host
  }

  get podUri () {
    const webIdUrl = url.parse(this.webId)
    const podUrl = `${webIdUrl.protocol}//${webIdUrl.host}`
    return url.format(podUrl)
  }

  get profileUri () {
    if (!this.webId) { return null }
    const parsed = url.parse(this.webId)
    return parsed.protocol + '//' + parsed.host + parsed.pathname
  }
}

export default UserAccount
