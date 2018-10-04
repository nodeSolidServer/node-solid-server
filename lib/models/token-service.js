'use strict'

const ulid = require('ulid')

class TokenService {
  constructor () {
    this.tokens = {}
  }

  generate (domain, data = {}) {
    const token = ulid()
    this.tokens[domain] = this.tokens[domain] || {}

    const value = {
      exp: new Date(Date.now() + 20 * 60 * 1000)
    }
    this.tokens[domain][token] = Object.assign({}, value, data)

    return token
  }

  verify (domain, token) {
    const now = new Date()

    if (!this.tokens[domain]) {
      throw new Error(`Invalid domain for tokens: ${domain}`)
    }

    let tokenValue = this.tokens[domain][token]

    if (tokenValue && now < tokenValue.exp) {
      return tokenValue
    } else {
      return false
    }
  }

  remove (domain, token) {
    if (!this.tokens[domain]) {
      throw new Error(`Invalid domain for tokens: ${domain}`)
    }

    delete this.tokens[domain][token]
  }
}

module.exports = TokenService
