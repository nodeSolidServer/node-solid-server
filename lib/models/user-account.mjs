import { URL } from 'url'

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
    const parsed = new URL(this.webId)
    let id = parsed.host + parsed.pathname
    if (parsed.hash) {
      id += parsed.hash
    }
    return id
  }

  get accountUri () {
    if (!this.webId) { return null }
    const parsed = new URL(this.webId)
    return parsed.origin
  }

  get podUri () {
    const webIdUrl = new URL(this.webId)
    return webIdUrl.origin
  }

  get profileUri () {
    if (!this.webId) { return null }
    const parsed = new URL(this.webId)
    return parsed.origin + parsed.pathname
  }
}

export default UserAccount
