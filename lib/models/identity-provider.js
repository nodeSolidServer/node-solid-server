module.exports = IdentityProvider

var webid = require('webid')
var $rdf = require('rdflib')
var sym = $rdf.sym
var lit = $rdf.lit
var async = require('async')
var parallel = async.parallel
var waterfall = async.waterfall
var debug = require('./../debug').idp
var express = require('express')
var bodyParser = require('body-parser')
var errorHandler = require('./../handlers/error-pages')
var url = require('url')
var uriAbs = require('./../utils').uriAbs
var serialize = require('./../utils').serialize
var forge = require('node-forge')
var asn1 = forge.asn1
var pki = forge.pki
var parse = require('./../utils').parse
var stringToStream = require('./../utils').stringToStream
const stripLineEndings = require('./../utils').stripLineEndings

const CreateAccountRequest = require('./create-account-request')
const UserAccountManager = require('./account-manager')


var defaultContainers = []

function defaultBuildURI (account, host, port) {
  var hostAndPort = (host || 'localhost') + (port || '')
  return 'https://' + hostAndPort + '/'
}

// IdentityProvider singleton
function IdentityProvider (options) {
  options = options || {}
  this.store = options.store
  this.pathCard = options.pathCard || 'profile/card'
  this.suffixURI = options.suffixURI || '#me'
  this.buildURI = options.buildURI || defaultBuildURI
  this.suffixAcl = options.suffixAcl
  this.suffixMeta = options.suffixMeta
  this.defaultContainers = options.defaultContainers || defaultContainers
  this.inbox = options.inbox
  this.settings = options.settings
  this.auth = options.auth || 'tls'
}

/**
 * Generates an agent WebID from the options and the IdentityProvider Settings,
 * used for new user creation.
 * @param [options={}] {Object} Create user request options
 * @param [options.url] {String}
 * @param [options.username] {String}
 * @param [options.host] {String}
 * @return {String} WebID URL
 */
IdentityProvider.prototype.agent = function agent (options = {}) {
  let url = options.url || this.buildURI(options.username, options.host)
  let card = url + this.pathCard
  let webId = card + this.suffixURI
  return webId
}

// Store a graph straight into the LDPStore
IdentityProvider.prototype.putGraph = function (uri, graph) {
  var self = this
  return function (callback) {
    serialize(graph, uri, 'text/turtle', function (err, content) {
      if (err) {
        err.status = 500
        return callback(err)
      }
      var stream = stringToStream(content)
      var parsed = url.parse(uri)
      var host = parsed.hostname
      var path = parsed.path
      return self.store.put(host, path, stream, callback)
    })
  }
}

// Create an identity give the options and the WebID+TLS certificates
IdentityProvider.prototype.create = function (options, cert, callback) {
  var self = this

  // Set up paths
  options.url = options.url || self.buildURI(options.username, options.host)
  options.card = options.url + self.pathCard
  options.agent = options.card + self.suffixURI
  debug('Creating space ' + options.url)
  options.suffixAcl = self.suffixAcl
  options.suffixMeta = self.suffixMeta
  options.defaultContainers = options.defaultContainers || self.defaultContainers

  var settings = options.settings || self.settings
  if (settings) {
    options.preferences = options.url + settings + '/prefs.ttl'
  }
  var inbox = options.inbox || self.inbox
  if (inbox) {
    options.inbox = options.url + inbox + '/'
  }

  // Create graphs to be created
  var graphs = [
    self.putGraph(options.card, createCard(options, cert)),
    self.putGraph(options.card + self.suffixAcl, createCardAcl(options)),
    self.putGraph(options.url + self.suffixAcl, createRootAcl(options)),
    self.putGraph(options.url + self.suffixMeta, createRootMeta(options)),
    self.putGraph(options.url + self.suffixMeta + self.suffixAcl,
      createRootMetaAcl(options))
  ]
  if (options.preferences) {
    graphs.push(self.putGraph(options.preferences, createPreferences(options)))
  }
  if (options.inbox) {
    graphs.push(self.putGraph(options.inbox + self.suffixAcl,
      createInboxAcl(options)))
  }
  if (options.defaultContainers && options.defaultContainers.length > 0) {
    throw new Error('default containers is not supported yet')
  }

  // TODO remove port from host
  var subdomain = options.host.split(':')[0]
  self.store.exists(subdomain, '/', function (err) {
    // if page exists, cannot create account
    if (!options.firstUser && (!err || err.status !== 404)) {
      debug('Cannot create ' + subdomain + ', it already exists')
      var error = new Error('Account already exists')
      error.status = 400
      return callback(error)
    }

    debug('SIGNUP: ' + subdomain + ' is free')

    // Create all the graphs in parallel
    parallel(graphs, function (err) {
      if (err) {
        err.status = 500
        debug('Error creating account ' + options.agent + ': ' + err.message)
      }

      debug('Created files for ' + options.agent)

      // TODO delete all the files we just created
      callback(err)
    })
  })
}

function createRootMeta (options) {
  var graph = $rdf.graph()

  graph.add(
    sym(options.agent),
    sym('http://www.w3.org/ns/solid/terms#account'),
    sym(options.url))

  return graph
}

function createInboxAcl (options) {
  var graph = createAcl(
    options.inbox + options.suffixAcl,
    options.inbox,
    options.agent,
    options.email)

  addAppendAll(graph, options.inbox + options.suffixAcl, options.inbox)

  return graph
}

function createPreferences (options) {
  var graph = $rdf.graph()

  graph.add(
    sym(options.preferences),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/pim/space#ConfigurationFile'))

  graph.add(
    sym(options.preferences),
    sym('http://purl.org/dc/terms/title'),
    lit('Preferences file'))

  graph.add(
    sym(options.card),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/Person'))

  return graph
}

// Generates a WebID card and add the key if the cert is passed
function createCard (options, cert) {
  var graph = $rdf.graph()
  graph.add(
    sym(options.card),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/PersonalProfileDocument'))
  graph.add(
    sym(options.card),
    sym('http://xmlns.com/foaf/0.1/maker'),
    sym(options.agent))
  graph.add(
    sym(options.card),
    sym('http://xmlns.com/foaf/0.1/primaryTopic'),
    sym(options.agent))
  graph.add(
    sym(options.agent),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/Person'))

  if (options.name && options.name.length > 0) {
    graph.add(
      sym(options.agent),
      sym('http://xmlns.com/foaf/0.1/name'),
      lit(options.name))
  }
  graph.add(
    sym(options.agent),
    sym('http://www.w3.org/ns/pim/space#storage'),
    sym(options.url))

  if (options.preferences) {
    graph.add(
      sym(options.agent),
      sym('http://www.w3.org/ns/pim/space#preferencesFile'),
      sym(options.preferences))
  }

  if (options.inbox) {
    graph.add(
      sym(options.agent),
      sym('http://www.w3.org/ns/solid/terms#inbox'),
      sym(options.inbox))
  }

  if (cert) {
    addKey(graph, options.agent, cert, options)
  }

  return graph
}

// Add the WebID+TLS Public Key to the WebID graph
function addKey (graph, agent, cert, options) {
  options.date = options.date || new Date()
  var card = agent.split('#')[0]
  var key = card + '#key-' + options.date.getTime()

  graph.add(
    sym(agent),
    sym('http://www.w3.org/ns/auth/cert#key'),
    sym(key))
  graph.add(
    sym(key),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/cert#RSAPublicKey'))
  graph.add(
    sym(key),
    sym('http://purl.org/dc/terms/title'),
    lit('Created by solid-server'))
  graph.add(
    sym(key),
    sym('http://www.w3.org/2000/01/rdf-schema#label'),
    lit(options.name))
  graph.add(
    sym(key),
    sym('http://purl.org/dc/terms/created'),
    lit(options.date.toISOString(), '', sym('http://www.w3.org/2001/XMLSchema#dateTime')))

  var modulus = cert.publicKey.n.toString(16).toUpperCase()
  var exponent = cert.publicKey.e.toString()
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#modulus'),
    lit(modulus, '', sym('http://www.w3.org/2001/XMLSchema#hexBinary')))
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#exponent'),
    lit(exponent, '', sym('http://www.w3.org/2001/XMLSchema#int')))
}

function addAppendAll (graph, acl, url) {
  var appendAll = acl + '#appendall'

  graph.add(
    sym(appendAll),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(appendAll),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(appendAll),
    sym('http://www.w3.org/ns/auth/acl#agentClass'),
    sym('http://xmlns.com/foaf/0.1/Agent'))
  graph.add(
    sym(appendAll),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Append'))
}

function addReadAll (graph, acl, url) {
  var readAll = acl + '#readall'
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#agentClass'),
    sym('http://xmlns.com/foaf/0.1/Agent'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Read'))
}

function createAcl (acl, uri, agent, email) {
  var graph = $rdf.graph()
  var owner = acl + '#owner'

  graph.add(
    sym(owner),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(uri))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#agent'),
    sym(agent))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#defaultForNew'),
    sym(uri))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Read'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Write'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Control'))

  if (email && email.length > 0) {
    graph.add(
      sym(owner),
      sym('http://www.w3.org/ns/auth/acl#agent'),
      sym('mailto:' + email))
  }

  return graph
}

// Create an ACL for the WebID card
function createCardAcl (options) {
  var graph = createAcl(
    options.card + options.suffixAcl,
    options.card,
    options.agent,
    options.email)

  // Add ReadAll term
  addReadAll(graph, options.card + options.suffixAcl, options.card)

  return graph
}

// Create ACL for the space reserved for the new user
function createRootAcl (options) {
  var graph = createAcl(
    options.url + options.suffixAcl,
    options.url,
    options.agent,
    options.email)

  return graph
}

// Create ACL for the space reserved for the new user
function createRootMetaAcl (options) {
  var graph = createAcl(
    options.url + options.suffixAcl,
    options.url,
    options.agent)

  // Add ReadAll term
  addReadAll(graph, options.url + options.suffixMeta + options.suffixAcl,
    options.url + options.suffixMeta)

  return graph
}

// TODO create defaultContainers
IdentityProvider.prototype.get = function (req, res, next) {
  if (req.path !== '/') {
    return next()
  }
  this.store.exists(req.hostname, '/', function (err) {
    if (err && err.status === 404) {
      // TODO maybe a personalized page
      // or a redirect
      debug('Account on ' + req.hostname + ' is available from ' +
        req.originalUrl)
      return res.sendStatus(404)
    } else {
      debug('Account on ' + req.hostname + ' is not available ' +
        req.originalUrl)
      return next()
    }
  })
}

IdentityProvider.prototype.newCert = function (req, res, next) {
  var self = this

  var options = req.body
  if (!options || !options.spkac || !options.webid) {
    debug('Request for certificate not valid')
    var err = new Error('Request for certificate not valid')
    err.status = 500
    return next(err)
  }
  var spkac = new Buffer(stripLineEndings(options.spkac), 'utf-8')

  debug('Requesting new cert for ' + options.webid)

  if (req.session.userId !== options.webid) {
    debug('user is not logged in: ' + req.session.userId + ' is not ' +
      options.webid)
    var error = new Error("You are not logged in, so you can't create a certificate")
    error.status = 401
    return next(error)
  }

  options.date = new Date()
  options.host = req.get('host')
  options.name = options.name || options.host

  // Get a new cert
  webid('tls').generate({
    spkac: spkac,
    commonName: options.name + ' [on ' + options.host + ' created at ' +
      options.date.toDateString() + ']',
    issuer: { commonName: options.host },
    duration: 10,
    agent: options.webid
  }, function (err, cert) {
    if (err) {
      debug('Error generating a certificate: ' + err.message)
      err.status = 500
      return next(err)
    }

    // Get the current graph
    self.getGraph(options.webid, function (err, card) {
      if (err) {
        debug('Error getting the webID: ' + err.message)
        return next(err)
      }

      addKey(card, options.webid, cert, options)
      self.putGraph(options.webid, card)(function (err) {
        if (err) {
          debug('Error saving the WebID: ' + err.message)
          return next(err)
        }

        debug('Sending new cert as response')
        res.set('Content-Type', 'application/x-x509-user-cert')
        // Convert to DER
        var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
        res.send(new Buffer(der, 'binary'))
      })
    })
  })
}

IdentityProvider.prototype.getGraph = function (uri, callback) {
  var self = this

  var parsed = url.parse(uri)
  var hostname = parsed.hostname
  var reqPath = parsed.path

  var options = {
    'hostname': hostname,
    'path': reqPath,
    'baseUri': null,
    'includeBody': true,
    'possibleRDFType': 'text/turtle'
  }
  self.store.get(options,
    function (err, ret) {
      if (err) {
        debug('Cannot find WebID card')
        var notexists = new Error('Cannot find WebID card')
        notexists.status = 500
        return callback(notexists)
      }
      if (ret) {
        var stream = ret.stream
      }
      var data = ''
      stream
        .on('data', function (chunk) {
          data += chunk
        })
        .on('end', function () {
          // TODO make sure that uri is correct
          parse(data, uri, 'text/turtle', function (err, card) {
            if (err) {
              debug("WebId can't be parsed: " + err.message)
              var invalid = new Error('You have an invalid WebID card')
              invalid.status = 500
              return callback(invalid)
            }

            return callback(null, card)
          })
        })
    })
}

/**
 * Handles POST requests to /api/accounts/new, creates a new user account.
 * @param req
 * @param res
 * @param next
 * @param [req.body] {Object} User options submitted by signup app or API
 * @param [req.body.name] {String} User's name
 * @param [req.body.email] {String} User's email address (for recovery etc)
 * @param [req.body.url] {String} User account URL (`username.databox.com`)
 * @param [req.body.username] {String} Username, passed through to `agent()` and
 *   used in WebID URL creation if the `url` parameter is missing.
 * @method post
 */
IdentityProvider.prototype.post = function post (req, res, next) {
  let firstUser = res.locals.firstUser
  let emailService = req.app.locals.email

  let username = req.body.username
  let mgr = UserAccountManager.from({})
  let webId = mgr.accountWebIdFor(username)

  let options = Object.assign(
    { auth: this.auth, firstUser, emailService },
    req.body
  )
  debug('Create account with settings ', options)

  let request

  return Promise.resolve(options)
    .then(options => {
      request = CreateAccountRequest.from(options)
    })
    .then(() => {
      return request.generateTlsCertificate()
    })
    .then(certificate => {
      return request.createAccount(certificate)
    })
    .then(() => {
      debug(options.host + ': account created, now setting the cookies and response')
      // Set the cookies on success
      req.session.userId = agent
      req.session.identified = true
      res.set('User', agent)
      res.status(200)
    })
    .then(() => {
      return Promise.all([
        () => { return emailService.sendWelcomeEmail() },
        () => {
          // Write response
          if (cert) {
            res.set('Content-Type', 'application/x-x509-user-cert')
            // Convert to DER
            var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
            res.send(der)
          } else {
            res.end()
          }
        }
      ])
    })

  var agent = self.agent(options)
  var spkac = null
  var cert = null

  waterfall([
    // (callback) => {
    //   // Generate a new WebID-TLS certificate, if appropriate
    //   if (!(this.auth === 'tls' && options.spkac && options.spkac.length > 0)) {
    //     return callback(null, false)
    //   }
    //   spkac = new Buffer(stripLineEndings(options.spkac), 'utf-8')
    //   webid('tls').generate({
    //     spkac: spkac,
    //     agent: agent
    //   }, callback)
    // },
    function (newCert, callback) {
      cert = newCert
      self.create(options, cert, callback)
    },
    // function (callback) {
    //   // Optionally send a new account welcome email
    //   if (emailService && options.email) {
    //     const emailData = {
    //       from: `"no-reply" <${emailService.sender}>`,
    //       to: options.email
    //     }
    //     const vars = {
    //       webid: agent,
    //       name: req.body.name || 'User'
    //     }
    //
    //     emailService.welcomeTemplate((template) => {
    //       const sendWelcomeEmail = emailService.mailer.templateSender(
    //         template,
    //         { from: emailData.from })
    //
    //       // use template based sender to send a message
    //       sendWelcomeEmail({ to: emailData.to }, vars, callback)
    //     })
    //   } else {
    //     callback()
    //   }
    // }
  ], function (err) {
    if (err) {
      err.status = err.status || 500
      debug('Error creating ' + options.user + ': ' + err.message)
      return next(err)
    }

    // debug(options.host + ': account created, now setting the cookies and response')
    // // Set the cookies on success
    // req.session.userId = agent
    // req.session.identified = true
    // response.set('User', agent)
    // response.status(200)
    //
    // if (cert) {
    //   response.set('Content-Type', 'application/x-x509-user-cert')
    //   // Convert to DER
    //   var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
    //   response.send(der)
    // } else {
    //   response.end()
    // }
  })
}

// Middleware (or Router) to serve the IdentityProvider
IdentityProvider.prototype.middleware = function (firstUser) {
  var router = express.Router('/')
  var parser = bodyParser.urlencoded({ extended: false })

  router.post('/new',
    parser,
    setFirstUser(firstUser),
    this.post.bind(this)
  )
  if (this.auth === 'tls') {
    router.post('/cert', parser, this.newCert.bind(this))
  }
  router.all('/*', function (req, res) {
    var host = uriAbs(req)
    // TODO replace the hardcoded link with an arg
    res.redirect('https://solid.github.io/solid-signup/?acc=api/accounts/new&crt=api/accounts/cert&domain=' + host)
  })
  router.use(errorHandler)

  return router
}

function setFirstUser (isFirstUser) {
  return function (req, res, next) {
    res.locals.firstUser = isFirstUser
    next()
  }
}
