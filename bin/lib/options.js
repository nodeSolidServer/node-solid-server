const fs = require('fs')
const path = require('path')
const validUrl = require('valid-url')

module.exports = [
  // {
  //   abbr: 'v',
  //   flag: true,
  //   help: 'Print the logs to console\n'
  // },
  {
    name: 'root',
    help: "Root folder to serve (defaut: './')",
    question: 'Path to the folder you want to serve. Default is',
    default: './',
    prompt: true,
    filter: (value) => path.resolve(value)
  },
  {
    name: 'port',
    help: 'SSL port to use',
    question: 'SSL port to run on. Default is',
    default: '8443',
    prompt: true
  },
  {
    name: 'serverUri',
    question: 'Solid server uri (with protocol, hostname and port)',
    help: "Solid server uri (default: 'https://localhost:8443')",
    default: 'https://localhost:8443',
    validate: validUri,
    prompt: true
  },
  {
    name: 'webid',
    help: 'Enable WebID authentication and access control (uses HTTPS)',
    flag: true,
    default: true,
    question: 'Enable WebID authentication',
    prompt: true
  },
  {
    name: 'mount',
    help: "Serve on a specific URL path (default: '/')",
    question: 'Serve Solid on URL path',
    default: '/',
    prompt: true
  },
  {
    name: 'config-path',
    question: 'Path to the config directory (for example: /etc/solid-server)',
    default: './config',
    prompt: true
  },
  {
    name: 'db-path',
    question: 'Path to the server metadata db directory (for users/apps etc)',
    default: './.db',
    prompt: true
  },
  {
    name: 'auth',
    help: 'Pick an authentication strategy for WebID: `tls` or `oidc`',
    question: 'Select authentication strategy',
    type: 'list',
    choices: [
      'WebID-OpenID Connect'
    ],
    prompt: false,
    default: 'WebID-OpenID Connect',
    filter: (value) => {
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
    help: 'Set the owner of the storage (overwrites the root ACL file)',
    question: 'Your webid (to overwrite the root ACL with)',
    prompt: false,
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
    help: 'Enable multi-user mode (users can sign up for accounts)',
    question: 'Enable multi-user mode (users can sign up for accounts)',
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
    help: 'Do you want to have a CORS proxy endpoint?',
    flag: true,
    prompt: true,
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
    prompt: false
  },

  {
    name: 'suppress-data-browser',
    help: 'Suppress provision of a data browser',
    flag: true,
    prompt: false,
    default: false,
    hide: false
  },

  {
    name: 'data-browser-path',
    help: 'An HTML file which is sent to allow users to browse the data (eg using mashlib.js)',
    question: 'Path of data viewer page (defaults to using mashlib)',
    validate: validPath,
    default: 'default',
    prompt: false
  },
  {
    name: 'suffix-acl',
    full: 'suffix-acl',
    help: "Suffix for acl files (default: '.acl')",
    default: '.acl',
    prompt: false
  },
  {
    name: 'suffix-meta',
    full: 'suffix-meta',
    help: "Suffix for metadata files (default: '.meta')",
    default: '.meta',
    prompt: false
  },
  {
    name: 'secret',
    help: 'Secret used to sign the session ID cookie (e.g. "your secret phrase")',
    question: 'Session secret for cookie',
    default: 'random',
    prompt: false,
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
    validate: validPath,
    prompt: false
  },
  {
    name: 'force-user',
    help: 'Force a WebID to always be logged in (useful when offline)'
  },
  {
    name: 'strict-origin',
    help: 'Enforce same origin policy in the ACL',
    flag: true,
    default: false,
    prompt: false
  },
  {
    name: 'useEmail',
    help: 'Do you want to set up an email service?',
    flag: true,
    prompt: true,
    default: false
  },
  {
    name: 'email-host',
    help: 'Host of your email service',
    prompt: true,
    default: 'smtp.gmail.com',
    when: (answers) => {
      return answers.useEmail
    }
  },
  {
    name: 'email-port',
    help: 'Port of your email service',
    prompt: true,
    default: '465',
    when: (answers) => {
      return answers.useEmail
    }
  },
  {
    name: 'email-auth-user',
    help: 'User of your email service',
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
    help: 'Password of your email service',
    type: 'password',
    prompt: true,
    when: (answers) => {
      return answers.useEmail
    }
  },
  {
    name: 'useApiApps',
    help: 'Do you want to load your default apps on /api/apps?',
    flag: true,
    prompt: false,
    default: true
  },
  {
    name: 'api-apps',
    help: 'Path to the folder to mount on /api/apps',
    prompt: true,
    validate: validPath,
    when: (answers) => {
      return answers.useApiApps
    }
  }
]

function validPath (value) {
  if (value === 'default') {
    return Promise.resolve(true)
  }
  if (!value || value === '') {
    return Promise.resolve('You must enter a valid path')
  }
  return new Promise((resolve) => {
    fs.stat(value, function (err) {
      if (err) return resolve('Nothing found at this path')
      return resolve(true)
    })
  })
}

function validUri (value) {
  if (!validUrl.isUri(value)) {
    return 'Enter a valid uri (with protocol)'
  }
  return true
}
