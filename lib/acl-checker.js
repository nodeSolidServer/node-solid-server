'use strict'

const async = require('async')
const path = require('path')
const url = require('url')

const DEFAULT_ACL_SUFFIX = '.acl'

class ACLChecker {
  constructor (options = {}) {
    this.debug = options.debug || console.log.bind(console)
    this.fetch = options.fetch
    this.strictOrigin = options.strictOrigin
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
  }

  can (user, mode, resource, callback, options = {}) {
    const debug = this.debug
    debug('Can ' + (user || 'an agent') + ' ' + mode + ' ' + resource + '?')
    var accessType = 'accessTo'
    var possibleACLs = ACLChecker.possibleACLs(resource, this.suffix)
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(resource)) {
      mode = 'Control'
    }
    var self = this
    async.eachSeries(
      possibleACLs,

      // Looks for ACL, if found, looks for a rule
      function tryAcl (acl, next) {
        debug('Check if acl exist: ' + acl)
        // Let's see if there is a file..
        self.fetch(acl, function (err, graph) {
          if (err || !graph || graph.length === 0) {
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
            (err) => { return next(!err || err) },
            options
          )
        })
      },
      function handleNoAccess (err) {
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

  findAgentClass (graph, user, mode, resource, acl, callback) {
    const debug = this.debug
    // Agent class statement
    var agentClassStatements = graph.match(acl,
      'http://www.w3.org/ns/auth/acl#agentClass')
    if (agentClassStatements.length === 0) {
      return callback(false)
    }
    async.some(
      agentClassStatements,
      function (agentClassTriple, found) {
        // Check for FOAF groups
        debug('Found agentClass policy')
        if (agentClassTriple.object.uri === 'http://xmlns.com/foaf/0.1/Agent') {
          debug(mode + ' allowed access as FOAF agent')
          return found(true)
        }
        return found(false)
      },
      callback)
  }

  findRule (graph, user, mode, resource, accessType, acl, callback, options) {
    const debug = this.debug
    if (!graph || graph.length === 0) {
      debug('ACL ' + acl + ' is empty')
      return callback(new Error('No policy found'))
    }
    debug('Found policies in ' + acl)
    // Check for mode
    var statements = this.getMode(graph, mode)
    if (mode === 'Append') {
      statements = statements.concat(this.getMode(graph, 'Write'))
    }
    var self = this
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
          agentStatements = graph.match(
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

  getMode (graph, mode) {
    return graph.match(
      null,
      'http://www.w3.org/ns/auth/acl#mode',
      'http://www.w3.org/ns/auth/acl#' + mode
    )
  }

  isAcl (resource) {
    return resource.endsWith(this.suffix)
  }

  matchAccessType (graph, rule, accessType, uri) {
    var matches = graph.match(
      rule,
      'http://www.w3.org/ns/auth/acl#' + accessType
    )
    return matches.some(function (match) {
      return uri.startsWith(match.object.uri)
    })
  }

  matchOrigin (graph, rule, origin, host) {
    // if there is no origin, then the host is the origin
    if (this.strictOrigin && !origin) {
      return true
    }
    var origins = graph.match(
      rule,
      'http://www.w3.org/ns/auth/acl#origin'
    )
    if (origins.length) {
      return origins.some(function (triple) {
        return triple.object.uri === (origin || host)
      })
    }
    // return true if origin is not enforced
    return !this.strictOrigin
  }

  static possibleACLs (uri, suffix) {
    var first = uri.endsWith(suffix) ? uri : uri + suffix
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
}

module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
