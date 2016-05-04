const fs = require('fs')

module.exports = [
  // {
  //   abbr: 'v',
  //   flag: true,
  //   help: 'Print the logs to console\n'
  // },
  {
    name: 'root',
    help: 'Root folder to serve (defaut: \'./\')',
    question: 'Path to the folder you want to serve. Default is',
    default: './',
    prompt: true
  },
  {
    name: 'port',
    help: 'SSL port to use',
    question: 'SSL port to run on. Default is',
    default: '8443',
    prompt: true
  },
  {
    name: 'webid',
    help: 'Enable WebID+TLS authentication (use `--no-webid` for HTTP instead of HTTPS)',
    flag: true,
    question: 'Enable WebID-TLS authentication',
    prompt: true
  },
  {
    name: 'useOwner',
    question: 'Do you already have a WebID?',
    type: 'confirm',
    default: false,
    hide: true
  },
  {
    name: 'owner',
    help: 'Set the owner of the storage',
    question: 'Your webid',
    validate: function (value) {
      if (value === '' || !value.startsWith('http')) {
        return 'Enter a valid Webid'
      }
      return true
    },
    when: function (answers) {
      return answers.useOwner
    }
  },
  {
    name: 'ssl-key',
    help: 'Path to the SSL private key in PEM format',
    validate: validPath,
    prompt: true
  },
  {
    name: 'ssl-cert',
    help: 'Path to the SSL certificate key in PEM format',
    validate: validPath,
    prompt: true
  },
  {
    name: 'idp',
    help: 'Allow users to sign up for an account',
    full: 'allow-signup',
    flag: true,
    default: false,
    prompt: true
  },
  {
    name: 'no-live',
    help: 'Disable live support through WebSockets',
    flag: true,
    default: false
  },
  // {
  //   full: 'default-app',
  //   help: 'URI to use as a default app for resources (default: https://linkeddata.github.io/warp/#/list/)'
  // },
  {
    name: 'useProxy',
    help: 'Do you want to have a proxy?',
    flag: true,
    prompt: false,
    hide: true
  },
  {
    name: 'proxy',
    help: 'Serve proxy on path',
    when: function (answers) {
      return answers.useProxy
    },
    default: '/proxy',
    prompt: true
  },
  {
    name: 'file-browser',
    help: 'Type the URL of default app to use for browsing files (or use default)',
    default: 'default',
    filter: function (value) {
      if (value === 'default' || value === 'warp') {
        return 'https://linkeddata.github.io/warp/#/list/'
      }
      return value
    },
    prompt: true
  },
  {
    name: 'data-browser',
    flag: true,
    help: 'Enable viewing RDF resources using a default data browser application (e.g. mashlib)',
    question: 'Enable data viewer (defaults to using Tabulator)',
    prompt: true
  },
  {
    name: 'suffix-acl',
    full: 'suffix-acl',
    help: 'Suffix for acl files',
    default: '.acl'
  },
  {
    name: 'suffix-meta',
    full: 'suffix-meta',
    help: 'Suffix for metadata files',
    default: '.meta'
  },
  {
    name: 'secret',
    help: 'Secret used to sign the session ID cookie (e.g. "your secret phrase")',
    question: 'Session secret for cookie',
    default: 'random',
    filter: function (value) {
      if (value === '' || value === 'random') {
        return
      }
      return value
    }
  },
  // {
  //   full: 'no-error-pages',
  //   flag: true,
  //   help: 'Disable custom error pages (use Node.js default pages instead)'
  // },
  {
    name: 'error-pages',
    help: 'Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)',
    validate: validPath
  },
  {
    name: 'mount',
    help: 'Serve on a specific URL path (default: \'/\')',
    question: 'Serve Solid on path',
    default: '/'
  },
  {
    name: 'force-user',
    help: 'Force a WebID to always be logged in (useful when offline)'
  },
  {
    name: 'strict-origin',
    help: 'Enforce same origin policy in the ACL',
    flag: true,
    prompt: true
  }
]

function validPath (value) {
  if (!value || value === '') {
    return 'You must enter a valid path'
  }
  return new Promise((resolve, reject) => {
    fs.stat(value, function (err) {
      if (err) return reject('Nothing found at this path')
      return resolve(true)
    })
  })
}
