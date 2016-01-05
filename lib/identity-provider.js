module.exports = IdentityProvider

var webid = require('webid')
var $rdf = require('rdflib')
var uuid = require('uuid')
var sym = $rdf.sym
var lit = $rdf.lit
var async = require('async')
var parallel = async.parallel
var waterfall = async.waterfall
var debug = require('./debug').idp
var express = require('express')
var bodyParser = require('body-parser')
var errorHandler = require('./handlers/error');
var url = require('url')
var uriBase = require('./utils').uriBase

function defaultBuildURI (account, host, port) {
  var hostAndPort = (host || 'localhost') + (port || '')
  return 'https://' + account.toLowerCase() + '.' + hostAndPort + '/'
}

// IdentityProvider singleton
function IdentityProvider (options) {
  if (!(this instanceof IdentityProvider)) {
    return new IdentityProvider(options)
  }
  options = options || {}
  this.store = options.store
  this.pathCard = options.pathCard || 'profile/card'
  this.suffixURI = options.suffixURI || '#me'
  this.buildURI = options.buildURI || defaultBuildURI
  this.suffixAcl = options.suffixAcl
}

// Generate the future webid from the options and the IdentityProvider Settings
IdentityProvider.prototype.agent = function (options) {
  options = options || {}
  var url = options.url || this.buildURI(options.username, this.host)
  var card = url + this.pathCard
  var agent = card + this.suffixURI
  return agent
}

// Store a graph straight into the LDPStore
IdentityProvider.prototype.putGraph = function (uri, graph) {
  var self = this
  return function (callback) {
    var content = $rdf.serialize(content, graph, uri, 'text/turtle')
    var parsed = url.parse(uri)
    var host = parsed.hostname
    var path = parsed.path
    return self.store.put(host, path, content, callback)
  }
}

// Create an identity give the options and the WebID+TLS certificates
IdentityProvider.prototype.create = function (options, cert, callback) {
  var self = this

  options.url = options.url || self.buildURI(options.username, options.host)
  options.card = options.url + self.pathCard
  options.agent = options.card + self.suffixURI
  options.suffixAcl = self.suffixAcl

  var card = createCard(options, cert)
  var cardAcl = createCardAcl(options)
  var rootAcl = createRootAcl(options)

  // TODO create workspaces
  // remove port from host

  var hostname = url.parse(options.host).hostname
  var subdomain = options.username + '.' + hostname
  self.store.exists(subdomain, '/', function (err) {
    // if page exists
    if (!err || err.status !== 404) {
      var error = new Error('Account already exists')
      error.status = 406
      return callback(error)
    }

    parallel([
      self.putGraph(options.card, card),
      self.putGraph(options.card + self.suffixAcl, cardAcl),
      self.putGraph(options.url + self.suffixAcl, rootAcl)
    ], function (err) {
      if (err) {
        err.status = 500
      }

      callback(err)
    })
  })
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

  // TODO add workspace with inbox, timeline, preferencesFile..
  // See: https://github.com/linkeddata/gold/blob/master/webid.go

  if (cert) {
    addKey(graph, options.agent, cert)
  }

  return graph
}

// Add the WebID+TLS Public Key to the WebID graph
function addKey (graph, agent, cert) {
  var card = agent.split('#')[0]
  var key = card + '#key' + uuid.v4()

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
    sym('http://www.w3.org/2000/01/rdf-schema#label'),
    lit('Created on ' + (new Date()).toString()))
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#modulus'),
    lit(cert.mod, 'http://www.w3.org/2001/XMLSchema#hexBinary')) // TODO add Datatype "http://www.w3.org/2001/XMLSchema#hexBinary"
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#exponent'),
    lit(cert.exponent, 'http://www.w3.org/2001/XMLSchema#int')) // TODO add Datatype "http://www.w3.org/2001/XMLSchema#int"
}

// Create an ACL for the WebID card
function createCardAcl (options) {
  var graph = $rdf.graph()
  var url = options.card
  var acl = url + options.suffixAcl
  var agent = options.agent
  var owner = acl + '#owner'
  var readAll = acl + '#readall'

  graph.add(
    sym(owner),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))

  // This is soon to be deprecated
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(acl))

  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#agent'),
    sym(agent))
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

  return graph
}

// Create ACL for the space reserved for the new user
function createRootAcl (options) {
  var owner = options.url + options.suffixAcl + '#owner'
  var agent = options.agent

  var graph = $rdf.graph()
  graph.add(
    sym(owner),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(options.url))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(options.url))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#agent'),
    sym(agent))

  if (options.email && options.email.length > 0) {
    graph.add(
      sym(owner),
      sym('http://www.w3.org/ns/auth/acl#agent'),
      sym('mailto:' + options.email))
  }

  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#defaultForNew'),
    sym(options.url))
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

  return graph
}

// TODO create workspaces
IdentityProvider.prototype.get = function (req, res, next) {
  if (req.path !== '/') {
    return next()
  }
  this.store.exists(req.hostname, '/', function (err) {
    if (err && err.status === 404) {
      // TODO maybe a personalized page
      // or a redirect
      debug('Account on ' + req.hostname + ' is available from ' + req.originalUrl)
      return res.sendStatus(404)
    } else {
      debug('Account on ' + req.hostname + ' is not available ' + req.originalUrl)
      return next()
    }
  })
}

// Handle POST requests on account creation
IdentityProvider.prototype.post = function (req, res, next) {
  var self = this
  var options = req.body
  options.host = uriBase(req)
  debug('Create account with settings ', options)

  if (!options || !options.username) {
    var err = new Error('You must enter an account name!')
    err.status = 406
    return next(err)
  }

  var agent = self.agent(options)

  var cert = null
  waterfall([
    function (callback) {
      if (options['spkac'] && options['spkac'].length > 0) {
        webid('tls').generate({
          spkac: options['spkac'],
          agent: agent // TODO generate agent
        }, callback)
      } else {
        return callback(null, false)
      }
    },
    function (newSpkac, callback) {
      cert = newSpkac

      self.create(options, cert, callback)
    }
  ], function (err) {
    if (err) {
      return next(err)
    }

    // Set the cookies on success
    req.session.agent = agent
    res.set('User', agent)
    res.status(201)

    if (cert) {
      res.set('Content-Type', 'text/html')
      var encodedSpkac = new Buffer(cert).toString('base64')
      res.send('<iframe width="0" height="0" style="display: none;" src="data:application/x-x509-user-cert;base64,' + encodedSpkac + '"></iframe>')
    } else {
      res.end()
    }

  })
}

// Middleware (or Router) to serve the IdentityProvider
IdentityProvider.prototype.middleware = function (corsSettings) {
  var self = this
  var router = express.Router('/')
  if (corsSettings) router.use(corsSettings)
  router.post('/', bodyParser.urlencoded({ extended: false }), this.post.bind(this))
  router.all('/*', function (req, res) {
    var host = uriBase(req)
    res.redirect('https://solid.github.io/solid-signup/?domain=' + host + '/accounts')
  })
  router.use(errorHandler.handler)
  return router
}
