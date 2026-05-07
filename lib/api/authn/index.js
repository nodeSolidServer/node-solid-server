import oidc from './webid-oidc.js'
import tls from './webid-tls.js'
import forceUser from './force-user.js'

export { oidc, tls, forceUser }

// Provide a default export so callers can `import Auth from './lib/api/authn/index.js'`
export default { oidc, tls, forceUser }
