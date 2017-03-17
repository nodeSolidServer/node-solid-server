'use strict'

const url = require('url')
const debug = require('./../debug').authentication

const OidcManager = require('oidc-auth-manager')

/**
 * Returns an instance of the OIDC Authentication Manager, initialized from
 * argv / config.json server parameters.
 *
 * @param argv {Object} Config hashmap
 *
 * @param argv.host {SolidHost} Initialized SolidHost instance, including
 *   `serverUri`.
 *
 * @param [argv.dbPath='./db/oidc'] {string} Path to the auth-related storage
 *   directory (users, tokens, client registrations, etc, will be stored there).
 *
 * @param argv.saltRounds {number} Number of bcrypt password salt rounds
 *
 * @return {OidcManager} Initialized instance, includes a UserStore,
 *   OIDC Clients store, a Resource Authenticator, and an OIDC Provider.
 */
function fromServerConfig (argv) {
  let providerUri = argv.host.serverUri
  if (!providerUri) {
    throw new Error('Host with serverUri required for auth initialization')
  }

  let authCallbackUri = url.resolve(providerUri, '/api/oidc/rp')
  let postLogoutUri = url.resolve(providerUri, '/goodbye')

  let options = {
    debug,
    providerUri,
    dbPath: argv.dbPath || './db/oidc',
    authCallbackUri,
    postLogoutUri,
    saltRounds: argv.saltRounds,
    host: { debug }
  }

  return OidcManager.from(options)
}

module.exports = {
  fromServerConfig
}
