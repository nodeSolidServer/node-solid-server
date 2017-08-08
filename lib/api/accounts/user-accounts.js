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

  router.get('/', checkAccountExists(accountManager))

  router.post('/api/accounts/new', bodyParser, CreateAccountRequest.post)
  router.get(['/register', '/api/accounts/new'], CreateAccountRequest.get)

  router.post('/api/accounts/cert', bodyParser, newCertificate(accountManager))

  return router
}

module.exports = {
  middleware,
  checkAccountExists,
  newCertificate
}
