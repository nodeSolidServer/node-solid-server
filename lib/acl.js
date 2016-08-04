exports.allow = allow

var path = require('path')
var $rdf = require('rdflib')
var S = require('string')
var url = require('url')
var async = require('async')
var debug = require('./debug').ACL
var utils = require('./utils.js')

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function match (graph, s, p, o) {
  var matches = graph.statementsMatching(
    s ? $rdf.sym(s) : undefined,
    p ? $rdf.sym(p) : undefined,
    o ? $rdf.sym(o) : undefined)
  return matches
}

function ACL (opts) {
  var self = this
  opts = opts || {}

  self.fetch = opts.fetch
  self.match = opts.match || match
  self.suffix = opts.suffix || '.acl'
}

ACL.prototype.isAcl = function (resource) {
  return !!S(resource).endsWith(this.suffix)
}

ACL.prototype.can = function (user, mode, resource, callback, options) {
  debug('Can ' + (user || 'an agent') + ' ' + mode + ' ' + resource + '?')
  var self = this
  var accessType = 'accessTo'
  var acls = possibleACLs(resource, self.suffix)
  options = options || {}

  // If it is an ACL, only look for control this resource
  if (self.isAcl(resource)) {
    mode = 'Control'
  }

  async.eachSeries(
    acls,
    // Looks for ACL, if found, looks for a rule
    function (acl, next) {
      debug('Check if acl exist: ' + acl)

      // Let's see if there is a file..
      self.fetch(acl, function (err, graph) {
        if (err || !graph || graph.statements.length === 0) {
          // TODO
          // If no file is found and we want to Control,
          // we should not be able to do that!
          // Control is only to Read and Write the current file!
          // if (mode === 'Control') {
          //   return next(new Error('You can\'t Control an unexisting file'))
          // }
          if (err) debug('Error: ' + err)
          accessType = 'defaultForNew'
          return next()
        }
        self.findRule(
          graph, // The ACL graph
          user, // The webId of the user
          mode, // Read/Write/Append
          resource, // The resource we want to access
          accessType, // accessTo or defaultForNew
          acl, // The current Acl file!
          function (err) {
            return next(!err || err)
          }, options)
      })
    },
    function (err) {
      if (err === false || err === null) {
        debug('No ACL resource found - access not allowed')
        err = new Error('No Access Control Policy found')
      }

      if (err === true) {
        debug('ACL policy found')
        err = null
      }

      if (err) {
        debug('Error: ' + err.message)
        if (!user || user.length === 0) {
          debug('Authentication required')
          err.status = 401
          err.message = 'Access to ' + resource + ' requires authorization'
        } else {
          debug(mode + ' access denied for: ' + user)
          err.status = 403
          err.message = 'Access denied for ' + user
        }
      }

      return callback(err)
    })
}

ACL.prototype.findAgentClass = function (graph, user, mode, resource, acl,
                                         callback) {
  var self = this

  // Agent class statement
  var agentClassStatements = self.match(
    graph,
    acl,
    'http://www.w3.org/ns/auth/acl#agentClass',
    undefined)

  if (agentClassStatements.length === 0) {
    return callback(false)
  }

  async.some(agentClassStatements, function (agentClassTriple, found) {
    // Check for FOAF groups
    debug('Found agentClass policy')
    if (agentClassTriple.object.uri === 'http://xmlns.com/foaf/0.1/Agent') {
      debug(mode + ' allowed access as FOAF agent')
      return found(true)
    }

    return found(false)
  }, callback)
}

ACL.prototype.findRule = function (graph, user, mode, resource, accessType, acl,
                                   callback, options) {
  var self = this

  // TODO check if this is necessary
  if (graph.statements.length === 0) {
    debug('ACL ' + acl + ' is empty')
    return callback(new Error('No policy found'))
  }

  debug('Found policies in ' + acl)

  // Check for mode
  var statements = self.getMode(graph, mode)
  if (mode === 'Append') {
    statements = statements
      .concat(self.getMode(graph, 'Write'))
  }

  async.some(
    statements,
    function (statement, done) {
      var statementSubject = statement.subject.uri

      // Check for origin
      var matchOrigin = self.matchOrigin(graph, statementSubject,
        options.origin, options.host)
      if (!matchOrigin) {
        debug('The request does not match the origin')
        return done(false)
      }

      // Check for accessTo/defaultForNew
      if (!self.isAcl(resource) || accessType === 'defaultForNew') {
        debug('Checking for accessType:' + accessType)
        var accesses = self.matchAccessType(graph, statementSubject, accessType,
          resource)
        if (!accesses) {
          debug('Cannot find accessType ' + accessType)
          return done(false)
        }
      }

      // Check for Agent
      var agentStatements = []

      if (user) {
        agentStatements = self.match(
          graph,
          statementSubject,
          'http://www.w3.org/ns/auth/acl#agent',
          user)
      }

      if (agentStatements.length) {
        debug(mode + ' access allowed (as agent) for: ' + user)
        return done(true)
      }

      debug('Inspect agentClass')
      // Check for AgentClass
      return self.findAgentClass(graph, user, mode, resource, statementSubject,
        done)
    },
    function (found) {
      if (!found) {
        return callback(new Error('Acl found but policy not found'))
      }
      return callback(null)
    })
}

// TODO maybe these functions can be integrated in the code
ACL.prototype.getMode = function getMode (graph, mode) {
  var self = this
  return self.match(
    graph,
    undefined,
    'http://www.w3.org/ns/auth/acl#mode',
    'http://www.w3.org/ns/auth/acl#' + mode)
}

ACL.prototype.matchAccessType = function matchAccessType (graph, rule,
                                                          accessType, uri) {
  var self = this
  var matches = self.match(
    graph,
    rule,
    'http://www.w3.org/ns/auth/acl#' + accessType,
    undefined)

  return matches.some(function (match) {
    return S(uri).startsWith(match.object.uri)
  })
}

ACL.prototype.matchOrigin = function getOrigins (graph, rule, origin, host) {
  var self = this

  // if there is no origin, then the host is the origin
  if (this.strictOrigin && !origin) {
    return true
  }

  var origins = self.match(
    graph,
    rule,
    'http://www.w3.org/ns/auth/acl#origin',
    undefined)

  if (origins.length) {
    return origins.some(function (triple) {
      return triple.object.uri === (origin || host)
    })
  }

  // return true if origin is not enforced
  return !this.strictOrigin
}

function possibleACLs (uri, suffix) {
  var first = S(uri).endsWith(suffix) ? uri : uri + suffix
  var urls = [first]
  var parsedUri = url.parse(uri)
  var baseUrl = (parsedUri.protocol ? parsedUri.protocol + '//' : '') +
    (parsedUri.host || '')
  if (baseUrl + '/' === uri) {
    return urls
  }

  var times = parsedUri.pathname.split('/').length
  // TODO: improve temporary solution to stop recursive path walking above root
  if (parsedUri.pathname.endsWith('/')) {
    times--
  }

  for (var i = 0; i < times - 1; i++) {
    uri = path.dirname(uri)
    urls.push(uri + (uri[uri.length - 1] === '/' ? suffix : '/' + suffix))
  }
  return urls
}

function fetchDocument (host, ldp, baseUri) {
  return function (uri, callback) {
    var graph = $rdf.graph()
    async.waterfall([
      function (cb) {
        // URL is local
        var newPath = S(uri).chompLeft(baseUri).s
        // TODO prettify this
        var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
        var documentPath = utils.uriToFilename(newPath, root)
        var documentUri = url.parse(documentPath)
        documentPath = documentUri.pathname
        return ldp.readFile(documentPath, cb)
      },
      function (body, cb) {
        try {
          $rdf.parse(body, graph, uri, 'text/turtle')
        } catch (err) {
          return cb(err, graph)
        }
        return cb(null, graph)
      }
    ], callback)
  }
}

function getUserId (req, callback) {
  var onBehalfOf = req.get('On-Behalf-Of')
  if (!onBehalfOf) {
    return callback(null, req.session.userId)
  }

  var delegator = utils.debrack(onBehalfOf)
  verifyDelegator(req.hostname, delegator, req.session.userId,
    function (err, res) {
      if (err) {
        err.status = 500
        return callback(err)
      }

      if (res) {
        debug('Request User ID (delegation) :' + delegator)
        return callback(null, delegator)
      }
      return callback(null, req.session.userId)
    })
}

function verifyDelegator (host, ldp, baseUri, delegator, delegatee, callback) {
  fetchDocument(host, ldp, baseUri)(delegator, function (err, delegatorGraph) {
    // TODO handle error
    if (err) {
      err.status = 500
      return callback(err)
    }

    var delegatesStatements = delegatorGraph
      .each(delegatorGraph.sym(delegator),
        delegatorGraph.sym('http://www.w3.org/ns/auth/acl#delegates'),
        undefined)

    for (var delegateeIndex in delegatesStatements) {
      var delegateeValue = delegatesStatements[delegateeIndex]
      if (utils.debrack(delegateeValue.toString()) === delegatee) {
        callback(null, true)
      }
    }
    // TODO check if this should be false
    return callback(null, false)
  })
}
/**
 * Callback used by verifyDelegator.
 * @callback ACL~verifyDelegator_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {Boolean} result verification has passed or not
 */

function allow (mode) {
  return function (req, res, next) {
    var ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }
    var baseUri = utils.uriBase(req)

    var acl = new ACL({
      fetch: fetchDocument(req.hostname, ldp, baseUri),
      match: match,
      suffix: ldp.suffixAcl,
      strictOrigin: ldp.strictOrigin
    })

    getUserId(req, function (err, userId) {
      if (err) return next(err)

      var reqPath = res && res.locals && res.locals.path
        ? res.locals.path
        : req.path
      ldp.exists(req.hostname, reqPath, function (err, stat) {
        if (reqPath[reqPath.length - 1] !== '/' &&
            !err &&
            stat.isDirectory()) {
          reqPath += '/'
        }
        var options = {
          origin: req.get('origin'),
          host: req.protocol + '://' + req.get('host')
        }
        return acl.can(userId, mode, baseUri + reqPath, next, options)
      })
    })
  }
}
