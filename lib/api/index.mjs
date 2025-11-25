import authn from './authn/index.mjs'
import accounts from './accounts/user-accounts.mjs'

export { authn as authn, accounts as accounts }

// Provide a default export so callers can `import API from './lib/api/index.mjs'`
export default { authn, accounts }