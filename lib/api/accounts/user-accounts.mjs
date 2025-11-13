import express from 'express'
import { urlencoded } from 'body-parser'
const bodyParser = urlencoded({ extended: false })
import debug from '../../debug.mjs'
const debugAccounts = debug.accounts

import restrictToTopDomain from '../../handlers/restrict-to-top-domain.mjs'

import CreateAccountRequest from '../../requests/create-account-request.mjs'
import AddCertificateRequest from '../../requests/add-cert-request.mjs'
import DeleteAccountRequest from '../../requests/delete-account-request.mjs'
import DeleteAccountConfirmRequest from '../../requests/delete-account-confirm-request.mjs'

/**
 * Returns an Express middleware handler for checking if a particular account
 * exists (used by Signup apps).
 *
 * @param accountManager {AccountManager}
 *
 * @return {Function}
 */
export function checkAccountExists (accountManager) {
  return (req, res, next) => {
    const accountUri = req.hostname

    accountManager.accountUriExists(accountUri)
      .then(found => {
        if (!found) {
          debugAccounts(`Account ${accountUri} is available (for ${req.originalUrl})`)
          return res.sendStatus(404)
        }
        debugAccounts(`Account ${accountUri} is not available (for ${req.originalUrl})`)
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
export function newCertificate (accountManager) {
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
export function middleware (accountManager) {
  const router = express.Router('/')

  router.get('/', checkAccountExists(accountManager))

  router.post('/api/accounts/new', restrictToTopDomain, bodyParser, CreateAccountRequest.post)
  router.get(['/register', '/api/accounts/new'], restrictToTopDomain, CreateAccountRequest.get)

  router.post('/api/accounts/cert', restrictToTopDomain, bodyParser, newCertificate(accountManager))

  router.get('/account/delete', restrictToTopDomain, DeleteAccountRequest.get)
  router.post('/account/delete', restrictToTopDomain, bodyParser, DeleteAccountRequest.post)

  router.get('/account/delete/confirm', restrictToTopDomain, DeleteAccountConfirmRequest.get)
  router.post('/account/delete/confirm', restrictToTopDomain, bodyParser, DeleteAccountConfirmRequest.post)

  return router
}

export default {
  middleware,
  checkAccountExists,
  newCertificate
}