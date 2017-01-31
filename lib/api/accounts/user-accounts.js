'use strict'

const express = require('express')
const path = require('path')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const debug = require('../../debug').accounts

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
  }
}

function createAccount (accountManager) {
  return (req, res, next) => {
    let newAccount
    try {
      newAccount = accountManager.userAccountFrom(req.body)
    } catch (err) {
      err.status = err.status || 400
      return next(err)
    }

    return accountManager.createAccountFor(newAccount, req.session, res)
      .catch(err => {
        err.status = err.status || 400
        next(err)
      })
  }
}

function firstTimeSignup (accountManager) {
  return (req, res, next) => {
    // Only redirect browser requests to first-time signup
    if (!req.accepts('text/html')) { return next() }

    this.accountExists()
      .then(found => {
        if (!found) {
          redirectToFirstTimeSignup(res)
        }
      })
      .catch(next)
  }
}

function redirectToFirstTimeSignup (res) {
  res.set('Content-Type', 'text/html')
  let signup = path.join(__dirname, '../../static/signup.html')
  res.sendFile(signup)
}

function newCertificate (accountManager) {
  return (req, res, next) => {
    next()
  }
}

/**
 * Mounted on /api/accounts
 */
function middleware (accountManager) {
  let router = express.Router('/')

  if (accountManager.multiUser) {
    router.get('/', checkAccountExists(accountManager))
  } else {
    // this.accountExists()
    //   .then(found => {
    //     if (!found) {
    //       router.get('/*', this.handleFirstTimeSignup(accountManager))
    //     }
    //   })
  }

  router.post('/api/accounts/new', bodyParser, createAccount(accountManager))

  router.post('/api/accounts/cert', bodyParser, newCertificate(accountManager))

  return router
}

module.exports = {
  middleware,
  checkAccountExists,
  createAccount,
  firstTimeSignup,
  newCertificate
}
