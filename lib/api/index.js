'use strict'

module.exports = {
  authn: require('./authn'),
  oidc: require('./authn/webid-oidc'),
  accounts: require('./accounts/user-accounts')
}
