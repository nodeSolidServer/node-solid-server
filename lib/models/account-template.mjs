import path from 'path'
import mime from 'mime-types'
import recursiveRead from 'recursive-readdir'
import * as fsUtils from '../common/fs-utils.mjs'
import * as templateUtils from '../common/template-utils.mjs'
import LDP from '../ldp.mjs'
import { URL } from 'url'

export const TEMPLATE_EXTENSIONS = ['.acl', '.meta', '.json', '.hbs', '.handlebars']
export const TEMPLATE_FILES = ['card']

class AccountTemplate {
  constructor (options = {}) {
    this.substitutions = options.substitutions || {}
    this.templateExtensions = options.templateExtensions || TEMPLATE_EXTENSIONS
    this.templateFiles = options.templateFiles || TEMPLATE_FILES
  }

  static for (userAccount, options = {}) {
    const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)
    options = Object.assign({ substitutions }, options)
    return new AccountTemplate(options)
  }

  static copyTemplateDir (templatePath, accountPath) {
    return fsUtils.copyTemplateDir(templatePath, accountPath)
  }

  static templateSubstitutionsFor (userAccount) {
    const webUri = new URL(userAccount.webId)
    const podRelWebId = userAccount.webId.replace(webUri.origin, '')
    const substitutions = {
      name: userAccount.displayName,
      webId: userAccount.externalWebId ? userAccount.webId : podRelWebId,
      email: userAccount.email,
      idp: userAccount.idp
    }
    return substitutions
  }

  readAccountFiles (accountPath) {
    return new Promise((resolve, reject) => {
      recursiveRead(accountPath, (error, files) => {
        if (error) { return reject(error) }
        resolve(files)
      })
    })
  }

  readTemplateFiles (accountPath) {
    return this.readAccountFiles(accountPath)
      .then(files => files.filter((file) => this.isTemplate(file)))
  }

  processAccount (accountPath) {
    return this.readTemplateFiles(accountPath)
      .then(files => Promise.all(files.map(path => templateUtils.processHandlebarFile(path, this.substitutions))))
  }

  isTemplate (filePath) {
    const parsed = path.parse(filePath)
    const mimeType = mime.lookup(filePath)
    const isRdf = LDP.mimeTypeIsRdf(mimeType)
    const isTemplateExtension = this.templateExtensions.includes(parsed.ext)
    const isTemplateFile = this.templateFiles.includes(parsed.base) || this.templateExtensions.includes(parsed.base)
    return isRdf || isTemplateExtension || isTemplateFile
  }
}

export default AccountTemplate
