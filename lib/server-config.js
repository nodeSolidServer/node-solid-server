'use strict'
/**
 * Server config initialization utilities
 */

const fs = require('fs-extra')
const path = require('path')

/**
 * Ensures that a directory has been copied / initialized. Used to ensure that
 * account templates, email templates and default apps have been copied from
 * their defaults to the customizable config directory, at server startup.
 *
 * @param fromDir {string} Path to copy from (defaults)
 *
 * @param toDir {string} Path to copy to (customizable config)
 *
 * @return {string} Returns the absolute path for `toDir`
 */
function ensureDirCopyExists (fromDir, toDir) {
  fromDir = path.resolve(fromDir)
  toDir = path.resolve(toDir)

  if (!fs.existsSync(toDir)) {
    fs.copySync(fromDir, toDir)
  }

  return toDir
}

/**
 * Creates (copies from the server templates dir) a Welcome index page for the
 * server root web directory, if one does not already exist. This page
 * typically has links to account signup and login, and can be overridden by
 * the server operator.
 *
 * @param argv {Function} Express.js app object
 */
function ensureWelcomePage (argv) {
  let { multiuser, templates } = argv
  let rootDir = path.resolve(argv.root)
  let serverRootDir

  if (multiuser) {
    serverRootDir = path.join(rootDir, argv.host.hostname)
  } else {
    serverRootDir = rootDir
  }

  let defaultIndexPage = path.join(templates.server, 'index.html')
  let existingIndexPage = path.join(serverRootDir, 'index.html')
  let defaultIndexPageAcl = path.join(templates.server, 'index.html.acl')
  let existingIndexPageAcl = path.join(serverRootDir, 'index.html.acl')

  if (!fs.existsSync(existingIndexPage)) {
    fs.mkdirp(serverRootDir)
    fs.copySync(defaultIndexPage, existingIndexPage)
    fs.copySync(defaultIndexPageAcl, existingIndexPageAcl)
  }
}

/**
 * Ensures that the server config directory (something like '/etc/solid-server'
 * or './config', taken from the `configPath` config.json file) exists, and
 * creates it if not.
 *
 * @param argv
 *
 * @return {string} Path to the server config dir
 */
function initConfigDir (argv) {
  let configPath = path.resolve(argv.configPath)
  fs.mkdirp(configPath)

  return configPath
}

/**
 * Ensures that the customizable 'views' folder exists for this installation
 * (copies it from default views if not).
 *
 * @param configPath {string} Location of configuration directory (from the
 *   local config.json file or passed in as cli parameter)
 *
 * @return {string} Path to the views dir
 */
function initDefaultViews (configPath) {
  let defaultViewsPath = path.join(__dirname, '../default-views')
  let viewsPath = path.join(configPath, 'views')

  ensureDirCopyExists(defaultViewsPath, viewsPath)

  return viewsPath
}

/**
 * Makes sure that the various template directories (email templates, new
 * account templates, etc) have been copied from the default directories to
 * this server's own config directory.
 *
 * @param configPath {string} Location of configuration directory (from the
 *   local config.json file or passed in as cli parameter)
 *
 * @return {Object} Returns a hashmap of template directories by type
 *   (new account, email, server)
 */
function initTemplateDirs (configPath) {
  let accountTemplatePath = ensureDirCopyExists(
    path.join(__dirname, '../default-templates/new-account'),
    path.join(configPath, 'templates', 'new-account')
  )

  let emailTemplatesPath = ensureDirCopyExists(
    path.join(__dirname, '../default-templates/emails'),
    path.join(configPath, 'templates', 'emails')
  )

  let serverTemplatePath = ensureDirCopyExists(
    path.join(__dirname, '../default-templates/server'),
    path.join(configPath, 'templates', 'server')
  )

  return {
    account: accountTemplatePath,
    email: emailTemplatesPath,
    server: serverTemplatePath
  }
}

module.exports = {
  ensureDirCopyExists,
  ensureWelcomePage,
  initConfigDir,
  initDefaultViews,
  initTemplateDirs
}
