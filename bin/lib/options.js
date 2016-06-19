const fs = require('fs')
const path = require('path')

module.exports = [
  // {
  //   abbr: 'v',
  //   flag: true,
  //   description: 'Print the logs to console\n'
  // },
  {
    name: 'root',
    description: 'Root folder to serve (defaut: \'./\')',
    question: 'Path to the folder you want to serve. Default is',
    default: './',
    prompt: true,
    filter: (value) => path.resolve(value)
  },
  {
    name: 'port',
    description: 'SSL port to use',
    question: 'SSL port to run on. Default is',
    default: '8443',
    prompt: true
  },
  {
    name: 'webid',
    description: 'Enable WebID+TLS authentication (use `--no-webid` for HTTP instead of HTTPS)',
    flag: true,
    question: 'Enable WebID authentication',
    prompt: true
  },
  {
    name: 'auth',
    description: 'Pick an authentication strategy for WebID: `tls` or `oidc`',
    question: 'Select authentication strategy',
    type: 'list',
    choices: [
      'WebID-TLS',
      'WebID-OpenID Connect'
    ],
    prompt: true,
    default: 'WebID-TLS',
    filter: (value) => {
      if (value === 'WebID-TLS') return 'tls'
      if (value === 'WebID-OpenID Connect') return 'oidc'
    },
    when: (answers) => {
      return answers.webid
    }
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
    description: 'Set the owner of the storage',
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
    description: 'Path to the SSL private key in PEM format',
    validate: validPath,
    prompt: true
  },
  {
    name: 'ssl-cert',
    description: 'Path to the SSL certificate key in PEM format',
    validate: validPath,
    prompt: true
  },
  {
    name: 'idp',
    description: 'Allow users to sign up for an account',
    full: 'allow-signup',
    flag: true,
    default: false,
    prompt: true
  },
  {
    name: 'no-live',
    description: 'Disable live support through WebSockets',
    flag: true,
    default: false
  },
  // {
  //   full: 'default-app',
  //   description: 'URI to use as a default app for resources (default: https://linkeddata.github.io/warp/#/list/)'
  // },
  {
    name: 'useProxy',
    description: 'Do you want to have a proxy?',
    flag: true,
    prompt: false,
    hide: true
  },
  {
    name: 'proxy',
    description: 'Serve proxy on path',
    when: function (answers) {
      return answers.useProxy
    },
    default: '/proxy',
    prompt: true
  },
  {
    name: 'file-browser',
    description: 'Type the URL of default app to use for browsing files (or use default)',
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
    description: 'Enable viewing RDF resources using a default data browser application (e.g. mashlib)',
    question: 'Enable data viewer (defaults to using Tabulator)',
    prompt: true
  },
  {
    name: 'suffix-acl',
    description: 'Suffix for acl files',
    default: '.acl'
  },
  {
    name: 'suffix-meta',
    description: 'Suffix for metadata files',
    default: '.meta'
  },
  {
    name: 'secret',
    description: 'Secret used to sign the session ID cookie (e.g. "your secret phrase")',
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
  //   description: 'Disable custom error pages (use Node.js default pages instead)'
  // },
  {
    name: 'error-pages',
    description: 'Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)',
    validate: validPath
  },
  {
    name: 'mount',
    description: 'Serve on a specific URL path (default: \'/\')',
    question: 'Serve Solid on path',
    default: '/'
  },
  {
    name: 'force-user',
    description: 'Force a WebID to always be logged in (useful when offline)'
  },
  {
    name: 'strict-origin',
    description: 'Enforce same origin policy in the ACL',
    flag: true,
    prompt: true
  },
  {
    name: 'useEmail',
    description: 'Do you want to set up an email service?',
    flag: true,
    prompt: true,
    default: true,
    hide: true
  },
  {
    name: 'email-host',
    description: 'Host of your email service',
    prompt: true,
    default: 'smtp.gmail.com',
    when: (answers) => {
      return answers.useEmail
    }
  },
  {
    name: 'email-port',
    description: 'Port of your email service',
    prompt: true,
    default: '465',
    when: (answers) => {
      return answers.useEmail
    }
  },
  {
    name: 'email-auth-user',
    description: 'User of your email service',
    prompt: true,
    when: (answers) => {
      return answers.useEmail
    },
    validate: (value) => {
      if (!value || value === '') {
        return 'You must enter this information'
      }
      return true
    }
  },
  {
    name: 'email-auth-pass',
    description: 'Password of your email service',
    type: 'password',
    prompt: true,
    when: (answers) => {
      return answers.useEmail
    }
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
