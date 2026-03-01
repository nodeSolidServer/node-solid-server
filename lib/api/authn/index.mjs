import oidc from './webid-oidc.mjs'
import tls from './webid-tls.mjs'
import forceUser from './force-user.mjs'
import nostr from './webid-nostr.mjs'

export { oidc, tls, forceUser, nostr }

// Provide a default export so callers can `import Auth from './lib/api/authn/index.mjs'`
export default { oidc, tls, forceUser, nostr }
