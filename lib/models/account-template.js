'use strict'

const fs = require('fs-extra')
const path = require('path')
const mime = require('mime-types')
const recursiveRead = require('recursive-readdir')
const Handlebars = require('handlebars')

const RDF_MIME_TYPES = require('../ldp').RDF_MIME_TYPES
const TEMPLATE_EXTENSIONS = [ '.acl', '.meta', '.json', '.hbs', '.handlebars' ]
const TEMPLATE_FILES = [ 'card' ]

/**
 * Performs account folder initialization from an account template
 * (see `./config/account-template-default`, for example).
 *
 * @class AccountTemplate
 */
class AccountTemplate {
  /**
   * @constructor
   * @param [options={}] {Object}
   * @param [options.substitutions={}] {Object} Hashmap of key/value Handlebars
   *   template substitutions.
   * @param [options.rdfMimeTypes] {Array<string>} List of MIME types that are
   *   likely to contain RDF templates.
   * @param [options.templateExtensions] {Array<string>} List of extensions likely
   *   to contain templates.
   * @param [options.templateFiles] {Array<string>} List of reserved file names
   *   (such as the profile `card`) likely to contain templates.
   */
  constructor (options = {}) {
    this.substitutions = options.substitutions || {}
    this.rdfMimeTypes = options.rdfMimeTypes || RDF_MIME_TYPES
    this.templateExtensions = options.templateExtensions || TEMPLATE_EXTENSIONS
    this.templateFiles = options.templateFiles || TEMPLATE_FILES
  }

  /**
   * Factory method, returns an AccountTemplate for a given user account.
   *
   * @param userAccount {UserAccount}
   * @param [options={}] {Object}
   *
   * @return {AccountTemplate}
   */
  static for (userAccount, options = {}) {
    let substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)

    options = Object.assign({ substitutions }, options)

    return new AccountTemplate(options)
  }

  /**
   * Creates a new account directory by copying the account template to a new
   * destination (the account dir path).
   *
   * @param templatePath {string}
   * @param accountPath {string}
   *
   * @return {Promise}
   */
  static copyTemplateDir (templatePath, accountPath) {
    return new Promise((resolve, reject) => {
      fs.copy(templatePath, accountPath, (error) => {
        if (error) { return reject(error) }

        resolve()
      })
    })
  }

  /**
   * Returns a template substitutions key/value object for a given user account.
   *
   * @param userAccount {UserAccount}
   *
   * @return {Object}
   */
  static templateSubstitutionsFor (userAccount) {
    let substitutions = {
      name: userAccount.displayName,
      webId: userAccount.webId,
      email: userAccount.email
    }

    return substitutions
  }

  /**
   * Returns a flat list of all the files in an account dir (and all its subdirs).
   *
   * @param accountPath {string}
   *
   * @return {Promise<Array<string>>}
   */
  readAccountFiles (accountPath) {
    return new Promise((resolve, reject) => {
      recursiveRead(accountPath, (error, files) => {
        if (error) { return reject(error) }

        resolve(files)
      })
    })
  }

  /**
   * Returns a list of all of the files in an account dir that are likely to
   * contain Handlebars templates (and which need to be processed).
   *
   * @param accountPath {string}
   *
   * @return {Promise<Array<string>>}
   */
  readTemplateFiles (accountPath) {
    return this.readAccountFiles(accountPath)
      .then(files => {
        return files.filter((file) => { return this.isTemplate(file) })
      })
  }

  /**
   * Reads and processes each file in a user account that is likely to contain
   * Handlebars templates. Performs template substitutions on each one.
   *
   * @param accountPath {string}
   *
   * @return {Promise}
   */
  processAccount (accountPath) {
    return this.readTemplateFiles(accountPath)
      .then(files => {
        return Promise.all(
          files.map((path) => { return this.processFile(path) })
        )
      })
  }

  /**
   * Reads a file, processes it (performing template substitution), and saves
   * back the processed result.
   *
   * @param filePath {string}
   *
   * @return {Promise}
   */
  processFile (filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (error, rawSource) => {
        if (error) { return reject(error) }

        let output = this.processTemplate(rawSource)

        fs.writeFile(filePath, output, (error) => {
          if (error) { return reject(error) }
          resolve()
        })
      })
    })
  }

  /**
   * Performs a Handlebars string template substitution, and returns the
   * resulting string.
   *
   * @see https://www.npmjs.com/package/handlebars
   *
   * @param source {string} e.g. 'Hello, {{name}}'
   *
   * @return {string} Result, e.g. 'Hello, Alice'
   */
  processTemplate (source) {
    let template = Handlebars.compile(source)
    return template(this.substitutions)
  }

  /**
   * Tests whether a given file path is a template file (and so should be
   * processed by Handlebars).
   *
   * @param filePath {string}
   *
   * @return {boolean}
   */
  isTemplate (filePath) {
    let parsed = path.parse(filePath)

    let isRdf = this.rdfMimeTypes.includes(mime.lookup(filePath))
    let isTemplateExtension = this.templateExtensions.includes(parsed.ext)
    let isTemplateFile = this.templateFiles.includes(parsed.base) ||
        this.templateExtensions.includes(parsed.base)  // the '/.acl' case

    return isRdf || isTemplateExtension || isTemplateFile
  }
}

module.exports = AccountTemplate
module.exports.TEMPLATE_EXTENSIONS = TEMPLATE_EXTENSIONS
module.exports.TEMPLATE_FILES = TEMPLATE_FILES
