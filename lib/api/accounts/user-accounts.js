'use strict'

const express = require('express')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const debug = require('../../debug').accounts
const path = require('path')

const CreateAccountRequest = require('../../requests/create-account-request')
const AddCertificateRequest = require('../../requests/add-cert-request')

/**
 * Returns an Express middleware handler for checking if a particular account
 * exists (used by Signup apps).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function checkAccountExists (accountManager) {
  return (req, res, next) => {
    let accountUri = req.hostname
    accountManager.accountUriExists(accountUri)
      .then(found => {
        if (!found) {
          debug(`Account ${accountUri} is available (for ${req.originalUrl})`)
          return res.sendStatus(404)
        }
        debug(`Account ${accountUri} is not available (for ${req.originalUrl})`)
        next()
      })
      .catch(next)
  }
}

/**
 * Returns an Express middleware handler for creating a new user account
 * (POST /api/accounts/new).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function createAccount (accountManager) {
  return (req, res, next) => {
    let request

    try {
      request = CreateAccountRequest.fromParams(req, res, accountManager)
    } catch (err) {
      err.status = err.status || 400
      return next(err)
    }

    return request.createAccount()
      .catch(err => {
        err.status = err.status || 400
        next(err)
      })
  }
}

/**
 * Returns an Express middleware handler for intercepting any GET requests
 * for first time users (in single user mode), and redirecting them to the
 * signup page.
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
function firstTimeSignupRedirect (accountManager) {
  return (req, res, next) => {
    // Only redirect browser (HTML) requests to first-time signup
    if (!req.accepts('text/html')) { return next() }

    if (req.path.includes('signup.html')) { return next() }

    accountManager.accountExists()
      .then(found => {
        if (!found) {
          debug('(single user mode) Redirecting to account creation')

          res.redirect(302, '/signup.html')
        } else {
          next()
        }
      })
      .catch(next)
  }
}

/**
 * Returns an Express middleware handler for adding a new certificate to an
 * existing account (POST to /api/accounts/cert).
 *
 * @param accountManager
 *
 * @return {Function}
 */
function newCertificate (accountManager) {
  return (req, res, next) => {
    return AddCertificateRequest.handle(req, res, accountManager)
      .catch(err => {
        err.status = err.status || 400
        next(err)
      })
  }
}

/**
 * Returns an Express router for providing user account related middleware
 * handlers.
 *
 * @param accountManager {AccountManager}
 *
 * @return {Router}
 */
function middleware (accountManager) {
  let router = express.Router('/')

  if (accountManager.multiUser) {
    router.get('/', checkAccountExists(accountManager))
  } else {
    // In single user mode, if account has not yet been created, intercept
    // all GET requests and redirect to the Signup form
    accountManager.accountExists()
      .then(found => {
        if (!found) {
          const staticDir = path.join(__dirname, '../../../static')

          router.use('/signup.html',
            express.static(path.join(staticDir, 'signup.html')))
          router.use('/signup.html.acl',
            express.static(path.join(staticDir, 'signup.html.acl')))
          router.get('/*', firstTimeSignupRedirect(accountManager))
        }
      })
      .catch(error => {
        debug('Error during accountExists(): ', error)
      })
  }

  router.post('/api/accounts/new', bodyParser, createAccount(accountManager))

  router.post('/api/accounts/cert', bodyParser, newCertificate(accountManager))

  return router
}

module.exports = {
  middleware,
  checkAccountExists,
  createAccount,
  firstTimeSignupRedirect,
  newCertificate
}
