'use strict'

module.exports = {
  'auth': 'oidc',
  'localAuth': {
    'tls': true,
    'password': true
  },
  'configPath': './config',
  'dbPath': './.db',
  'port': 8443,
  'serverUri': 'https://localhost:8443',
  'webid': true
}
