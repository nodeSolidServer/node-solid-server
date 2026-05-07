import authn from './authn/index.js'
import accounts from './accounts/user-accounts.js'

export { authn, accounts }

// Provide a default export so callers can `import API from './lib/api/index.js'`
export default { authn, accounts }
