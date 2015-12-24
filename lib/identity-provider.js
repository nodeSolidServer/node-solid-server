module.exports = IdentityProvider

var webid = require('webid')
var $rdf = require('rdflib')
var uuid = require('uuid')
var sym = $rdf.sym
var lit = $rdf.lit

function defaultBuildURI (account, host, port) {
  var hostAndPort = host
  if (port) {
    hostAndPort = hostAndPort + port
  }
  if (!hostAndPort) hostAndPort = 'localhost'
  return 'https://' + account.toLowerCase() + '.' + hostAndPort + '/'
}

function IdentityProvider (options) {
  if (!(this instanceof IdentityProvider)) {
    return new IdentityProvider(options)
  }

  var self = this

  options = options || {}
  self.store = options.store
  self.pathCard = options.pathCard || 'profile/card'
  self.suffixURI = options.suffixURI || '#me'
  self.buildURI = options.buildURI || defaultBuildURI
}

IdentityProvider.prototype.create = function (options, callback) {
  if (!options || !options.account) {
    var err = new Error('You must enter an account name!')
    err.statusCode = 406 // TODO
    return callback(err)
  }

  var self = this
  options.url = options.url || self.buildURI(options.account, self.host)
  options.card = options.url + self.pathCard
  options.agent = options.card + self.suffixURI

  // TODO maybe use promises
  self.setupCard(options, function (err) {
    if (err) {
      return callback(err)
    }

    self.setupSpace(options, function () {
      if (err) {
        callback(err)
      }

      callback(null, options.agent)
    })
  })
}

IdentityProvider.prototype.setupSpace = function (options, callback) {
  var self = this

  self.createRootAcl(options, function (err) {
    if (err) {
      err.statusCode = 500
      return callback(err)
    }

    callback()
  })
}

IdentityProvider.prototype.createRootAcl = function (options, callback) {
  var email = options.email
  var url = options.url
  var acl = options.url + options.suffixAcl
  var owner = acl + '#owner'
  var graph = $rdf.graph()
  var agent = options.agent

  graph.add(
    sym(owner),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#agent'),
    sym(agent))

  if (email.length > 0) {
    graph.add(
      sym(owner),
      sym('http://www.w3.org/ns/auth/acl#agent'),
      sym('mailto:' + email))
  }

  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#defaultForNew'),
    sym(url))
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

  var content = graph.serialize(acl, 'text/turtle')
  return this.store.put(acl, content, callback)
}

IdentityProvider.prototype.setupCard = function (options, callback) {
  var self = this

  self.createCard(options, function (err) {
    if (err) {
      err.statusCode = 500 // TODO this should send 406 if taken
      return callback(err)
    }

    // TODO pass the right options
    self.createCardAcl(options, function (err) {
      if (err) {
        err.statusCode = 500 // TODO
        return callback(err)
      }

      // TODO create all the needed folders?
      return callback(err)
    })
  })
}

IdentityProvider.prototype.createCard = function (options, callback) {
  var self = this

  // TODO implement generate in webid
  var graph = webid.generate({
    // TODO list all the attributes
    // if any
  })

  var card = options.card

  var content = graph.serialize(card, 'text/turtle')
  return self.store.put(card, content, callback)
}

IdentityProvider.prototype.createCardAcl = function (options, callback) {
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

  var content = graph.serialize(acl, 'text/turtle')
  return this.store.put(acl, content, callback)
}

// TODO create workspaces
// TODO create master acl

IdentityProvider.prototype.post = function (req, res, next) {
  var self = this
  self.create(req.body, function (err, agent) {
    if (err) {
      return next(err)
    }

    res.session.agent = agent
    res.set('User', agent)

    if (req.body['spkac'] && req.body['spkac'].length > 0) {
      self.setupWebidTLS({
        spkac: req.body['spkac'],
        agent: agent
      }, next)
    } else {
      next()
    }
  })
}

IdentityProvider.prototype.setupWebidTLS = function (options, callback) {
  var self = this
  webid('tls').generate(options, function (err, cert) {
    if (err) {
      err.statusCode = 500
      return callback(err)
    }
    var id = uuid.v4()
    var card = options.agent.split('#')[0]
    var agent = options.agent
    var key = card + '#key' + id

    var graph = $rdf.graph()
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
      lit(cert.mod)) // add Datatype "http://www.w3.org/2001/XMLSchema#hexBinary"
    graph.add(
      sym(key),
      sym('http://www.w3.org/ns/auth/cert#exponent'),
      lit(cert.exponent)) // TODO add Datatype "http://www.w3.org/2001/XMLSchema#int"

    // TODO merge to append
    self.store.merge(card, graph, callback)
  })
}

IdentityProvider.prototype.middleware = function (req, res, next) {
  var self = this

  if (req.method === 'POST') {
    self.post(req, res, next)
  } else {
    var err = new Error('Can only do GET or POST')
    err.statusCode = 406
    next(err)
  }
}
