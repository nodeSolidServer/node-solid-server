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
  this.host = options.host
  this.buildURI = options.buildURI || defaultBuildURI
  debug('Setting up identity provider')
}

// Generate the future webid from the options and the IdentityProvider Settings
IdentityProvider.prototype.agent = function (options) {
  options = options || {}
  var url = options.url || this.buildURI(options.account, this.host)
  var card = url + this.pathCard
  var agent = card + this.suffixURI
  return agent
}

// Store a graph straight into the LDPStore
IdentityProvider.prototype.putGraph = function (uri, graph) {
  var self = this
  return function (callback) {
    var content = graph.serialize(uri, 'text/turtle')
    return self.store.put(uri, content, callback)
  }
}

// Create an identity give the options and the WebID+TLS certificates
IdentityProvider.prototype.create = function (options, cert, callback) {
  var self = this

  if (!options || !options.account) {
    var err = new Error('You must enter an account name!')
    err.statusCode = 406 // TODO
    return callback(err)
  }

  options.url = options.url || self.buildURI(options.account, self.host)
  options.card = options.url + self.pathCard
  options.agent = options.card + self.suffixURI

  var card = createCard(options, cert)
  var cardAcl = createCardAcl(options)
  var rootAcl = createRootAcl(options)

  // TODO create workspaces

  parallel([
    self.putGraph(options.card, card),
    self.putGraph(options.card + self.suffixAcl, cardAcl),
    self.putGraph(options.url + self.suffixAcl, rootAcl)
  ], function (err) {
    if (err) {
      err.statusCode = 500
    }

    callback(err)
  })
}

// Generates a WebID card and add the key if the cert is passed
function createCard (options, cert) {
  var graph = webid.generate({
    // TODO list all the attributes
    // if any
  })

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

// Handle POST requests on account creation
IdentityProvider.prototype.post = function (req, res, next) {
  var self = this

  debug('Create account with settings ', req.body)
  var agent = self.agent(req.body)

  waterfall([
    function (callback) {
      if (req.body['spkac'] && req.body['spkac'].length > 0) {
        webid('tls').generate({
          spkac: req.body['spkac'],
          agent: agent // TODO generate agent
        }, callback)
      } else {
        return callback()
      }
    },
    function (cert, callback) {
      self.create(req.body, cert, callback)
    }
  ], function (err) {
    if (err) {
      return next(err)
    }

    // Set the cookies on success
    res.session.agent = agent
    res.set('User', agent)

    next()
  })
}

// Middleware (or Router) to serve the IdentityProvider
IdentityProvider.prototype.middleware = function (req, res, next) {
  var self = this

  if (req.method === 'POST') {
    self.post(req, res, next)
  } else {
    var err = new Error('Can only do POST')
    err.statusCode = 406
    next(err)
  }
}
