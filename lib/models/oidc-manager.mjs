import url from 'url'
import path from 'path'
import debug from '../debug.mjs'
import OidcManager from '@solid/oidc-auth-manager'

export function fromServerConfig (argv) {
  const providerUri = argv.host.serverUri
  const authCallbackUri = url.resolve(providerUri, '/api/oidc/rp')
  const postLogoutUri = url.resolve(providerUri, '/goodbye')
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
