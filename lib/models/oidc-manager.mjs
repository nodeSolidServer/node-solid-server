/* eslint-disable no-unused-expressions */
import { URL } from 'url'
import path from 'path'
import debug from '../debug.mjs'
import OidcManager from '@solid/oidc-auth-manager'

export function fromServerConfig (argv) {
  const providerUri = argv.host.serverUri
  const authCallbackUri = new URL('/api/oidc/rp', providerUri).toString()
  const postLogoutUri = new URL('/goodbye', providerUri).toString()
  const dbPath = path.join(argv.dbPath, 'oidc')
  const options = {
    debug,
    providerUri,
    dbPath,
    authCallbackUri,
    postLogoutUri,
    saltRounds: argv.saltRounds,
    delayBeforeRegisteringInitialClient: argv.delayBeforeRegisteringInitialClient,
    host: { debug }
  }
  return OidcManager.from(options)
}
