import authn from './authn/index.mjs'
import accounts from './accounts/user-accounts.mjs'

export { authn, accounts }

// Provide a default export so callers can `import API from './lib/api/index.mjs'`
export default { authn, accounts }
