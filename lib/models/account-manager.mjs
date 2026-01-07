import { URL } from 'url'
import rdf from 'rdflib'
import vocab from 'solid-namespace'
import defaults from '../../config/defaults.mjs'
import UserAccount from './user-account.mjs'
import AccountTemplate, { TEMPLATE_EXTENSIONS, TEMPLATE_FILES } from './account-template.mjs'
import debugModule from './../debug.mjs'
const ns = vocab(rdf)

const debug = debugModule.accounts
const DEFAULT_PROFILE_CONTENT_TYPE = 'text/turtle'
const DEFAULT_ADMIN_USERNAME = 'admin'

class AccountManager {
  constructor (options = {}) {
    if (!options.host) {
      throw Error('AccountManager requires a host instance')
    }
    this.host = options.host
    this.emailService = options.emailService
    this.tokenService = options.tokenService
    this.authMethod = options.authMethod || defaults.auth
    this.multiuser = options.multiuser || false
    this.store = options.store
    this.pathCard = options.pathCard || 'profile/card'
    this.suffixURI = options.suffixURI || '#me'
    this.accountTemplatePath = options.accountTemplatePath || './default-templates/new-account/'
  }

  static from (options) {
    return new AccountManager(options)
  }

  accountExists (accountName) {
    let accountUri
    let cardPath
    try {
      accountUri = this.accountUriFor(accountName)
      accountUri = new URL(accountUri).hostname
      // `pathCard` is a path fragment like 'profile/card' -> ensure it starts with '/'
      cardPath = this.pathCard && this.pathCard.startsWith('/') ? this.pathCard : '/' + this.pathCard
    } catch (err) {
      return Promise.reject(err)
    }
    return this.accountUriExists(accountUri, cardPath)
  }

  async accountUriExists (accountUri, accountResource = '/') {
    try {
      return await this.store.exists(accountUri, accountResource)
    } catch (err) {
      return false
    }
  }

  accountDirFor (accountName) {
    const { hostname } = new URL(this.accountUriFor(accountName))
    return this.store.resourceMapper.resolveFilePath(hostname)
  }

  accountUriFor (accountName) {
    const accountUri = this.multiuser
      ? this.host.accountUriFor(accountName)
      : this.host.serverUri
    return accountUri
  }

  accountWebIdFor (accountName) {
    const accountUri = this.accountUriFor(accountName)
    const webIdUri = new URL(this.pathCard, accountUri)
    webIdUri.hash = this.suffixURI
    return webIdUri.toString()
  }

  rootAclFor (userAccount) {
    const accountUri = this.accountUriFor(userAccount.username)
    return new URL(this.store.suffixAcl, accountUri).toString()
  }

  addCertKeyToProfile (certificate, userAccount) {
    if (!certificate) {
      throw new TypeError('Cannot add empty certificate to user profile')
    }
    return this.getProfileGraphFor(userAccount)
      .then(profileGraph => this.addCertKeyToGraph(certificate, profileGraph))
      .then(profileGraph => this.saveProfileGraph(profileGraph, userAccount))
  }

  getProfileGraphFor (userAccount, contentType = DEFAULT_PROFILE_CONTENT_TYPE) {
    const webId = userAccount.webId
    if (!webId) {
      const error = new Error('Cannot fetch profile graph, missing WebId URI')
      error.status = 400
      return Promise.reject(error)
    }
    const uri = userAccount.profileUri
    return this.store.getGraph(uri, contentType)
      .catch(error => {
        error.message = `Error retrieving profile graph ${uri}: ` + error.message
        throw error
      })
  }

  saveProfileGraph (profileGraph, userAccount, contentType = DEFAULT_PROFILE_CONTENT_TYPE) {
    const webId = userAccount.webId
    if (!webId) {
      const error = new Error('Cannot save profile graph, missing WebId URI')
      error.status = 400
      return Promise.reject(error)
    }
    const uri = userAccount.profileUri
    return this.store.putGraph(profileGraph, uri, contentType)
  }

  addCertKeyToGraph (certificate, graph) {
    const webId = rdf.namedNode(certificate.webId)
    const key = rdf.namedNode(certificate.keyUri)
    const timeCreated = rdf.literal(certificate.date.toISOString(), ns.xsd('dateTime'))
    const modulus = rdf.literal(certificate.modulus, ns.xsd('hexBinary'))
    const exponent = rdf.literal(certificate.exponent, ns.xsd('int'))
    const title = rdf.literal('Created by solid-server')
    const label = rdf.literal(certificate.commonName)
    graph.add(webId, ns.cert('key'), key)
    graph.add(key, ns.rdf('type'), ns.cert('RSAPublicKey'))
    graph.add(key, ns.dct('title'), title)
    graph.add(key, ns.rdfs('label'), label)
    graph.add(key, ns.dct('created'), timeCreated)
    graph.add(key, ns.cert('modulus'), modulus)
    graph.add(key, ns.cert('exponent'), exponent)
    return graph
  }

  userAccountFrom (userData) {
    const userConfig = {
      username: userData.username,
      email: userData.email,
      name: userData.name,
      externalWebId: userData.externalWebId,
      localAccountId: userData.localAccountId,
      webId: userData.webid || userData.webId || userData.externalWebId,
      idp: this.host.serverUri
    }
    if (userConfig.username) {
      userConfig.username = userConfig.username.toLowerCase()
    }
    try {
      userConfig.webId = userConfig.webId || this.accountWebIdFor(userConfig.username)
    } catch (err) {
      if (err.message === 'Cannot construct uri for blank account name') {
        throw new Error('Username or web id is required')
      } else {
        throw err
      }
    }
    if (userConfig.username) {
      if (userConfig.externalWebId && !userConfig.localAccountId) {
        userConfig.localAccountId = this.accountWebIdFor(userConfig.username)
          .split('//')[1]
      }
    } else {
      if (userConfig.externalWebId) {
        userConfig.username = userConfig.externalWebId
      } else {
        userConfig.username = this.usernameFromWebId(userConfig.webId)
      }
    }
    return UserAccount.from(userConfig)
  }

  usernameFromWebId (webId) {
    if (!this.multiuser) {
      return DEFAULT_ADMIN_USERNAME
    }
    const profileUrl = new URL(webId)
    const hostname = profileUrl.hostname
    return hostname.split('.')[0]
  }

  createAccountFor (userAccount) {
    const template = AccountTemplate.for(userAccount)
    const templatePath = this.accountTemplatePath
    const accountDir = this.accountDirFor(userAccount.username)
    debug(`Creating account folder for ${userAccount.webId} at ${accountDir}`)
    return AccountTemplate.copyTemplateDir(templatePath, accountDir)
      .then(() => template.processAccount(accountDir))
  }

  generateResetToken (userAccount) {
    return this.tokenService.generate('reset-password', { webId: userAccount.webId })
  }

  generateDeleteToken (userAccount) {
    return this.tokenService.generate('delete-account.mjs', {
      webId: userAccount.webId,
      email: userAccount.email
    })
  }

  validateDeleteToken (token) {
    const tokenValue = this.tokenService.verify('delete-account.mjs', token)
    if (!tokenValue) {
      throw new Error('Invalid or expired delete account token')
    }
    return tokenValue
  }

  validateResetToken (token) {
    const tokenValue = this.tokenService.verify('reset-password', token)
    if (!tokenValue) {
      throw new Error('Invalid or expired reset token')
    }
    return tokenValue
  }

  passwordResetUrl (token, returnToUrl) {
    let resetUrl = new URL(`/account/password/change?token=${token}`, this.host.serverUri).toString()
    if (returnToUrl) {
      resetUrl += `&returnToUrl=${returnToUrl}`
    }
    return resetUrl
  }

  getAccountDeleteUrl (token) {
    return new URL(`/account/delete/confirm?token=${token}`, this.host.serverUri).toString()
  }

  loadAccountRecoveryEmail (userAccount) {
    return Promise.resolve()
      .then(() => {
        const rootAclUri = this.rootAclFor(userAccount)
        return this.store.getGraph(rootAclUri)
      })
      .then(rootAclGraph => {
        const matches = rootAclGraph.match(null, ns.acl('agent'))
        let recoveryMailto = matches.find(agent => agent.object.value.startsWith('mailto:'))
        if (recoveryMailto) {
          recoveryMailto = recoveryMailto.object.value.replace('mailto:', '')
        }
        return recoveryMailto
      })
  }

  verifyEmailDependencies (userAccount) {
    if (!this.emailService) {
      throw new Error('Email service is not set up')
    }
    if (userAccount && !userAccount.email) {
      throw new Error('Account recovery email has not been provided')
    }
  }

  sendDeleteAccountEmail (userAccount) {
    return Promise.resolve()
      .then(() => this.verifyEmailDependencies(userAccount))
      .then(() => this.generateDeleteToken(userAccount))
      .then(resetToken => {
        const deleteUrl = this.getAccountDeleteUrl(resetToken)
        const emailData = {
          to: userAccount.email,
          webId: userAccount.webId,
          deleteUrl: deleteUrl
        }
        return this.emailService.sendWithTemplate('delete-account.mjs', emailData)
      })
  }

  sendPasswordResetEmail (userAccount, returnToUrl) {
    return Promise.resolve()
      .then(() => this.verifyEmailDependencies(userAccount))
      .then(() => this.generateResetToken(userAccount))
      .then(resetToken => {
        const resetUrl = this.passwordResetUrl(resetToken, returnToUrl)
        const emailData = {
          to: userAccount.email,
          webId: userAccount.webId,
          resetUrl
        }
        return this.emailService.sendWithTemplate('reset-password.mjs', emailData)
      })
  }

  sendWelcomeEmail (newUser) {
    const emailService = this.emailService
    if (!emailService || !newUser.email) {
      return Promise.resolve(null)
    }
    const emailData = {
      to: newUser.email,
      webid: newUser.webId,
      name: newUser.displayName
    }
    return emailService.sendWithTemplate('welcome.mjs', emailData)
  }
}

export default AccountManager
export { TEMPLATE_EXTENSIONS, TEMPLATE_FILES }
