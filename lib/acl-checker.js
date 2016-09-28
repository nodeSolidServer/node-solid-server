'use strict'

const async = require('async')
const path = require('path')
const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
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
            if (err) debug('Error: ' + err)
            accessType = 'defaultForNew'
            return next()
          }
          self.checkAccess(
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

  /**
   * Tests whether a graph (parsed .acl resource) allows a given operation
   * for a given user. Calls the provided callback with `null` if the user
   * has access, otherwise calls it with an error.
   * @method checkAccess
   * @param graph {Graph} Parsed RDF graph of current .acl resource
   * @param user {String} WebID URI of the user accessing the resource
   * @param mode {String} Access mode, e.g. 'Read', 'Write', etc.
   * @param resource {String} URI of the resource being accessed
   * @param accessType {String} One of `accessTo`, or `default`
   * @param acl {String} URI of this current .acl resource
   * @param callback {Function}
   * @param options {Object} Options hashmap
   * @param [options.origin] Request's `Origin:` header
   * @param [options.host] Request's host URI (with protocol)
   */
  checkAccess (graph, user, mode, resource, accessType, acl, callback,
               options = {}) {
    const debug = this.debug
    if (!graph || graph.length === 0) {
      debug('ACL ' + acl + ' is empty')
      return callback(new Error('No policy found - empty ACL'))
    }
    let isContainer = accessType.startsWith('default')
    let aclOptions = {
      aclSuffix: this.suffix,
      graph: graph,
      host: options.host,
      origin: options.origin,
      rdf: rdf,
      strictOrigin: this.strictOrigin,
      isAcl: (uri) => { return this.isAcl(uri) },
      aclUrlFor: (uri) => { return this.aclUrlFor(uri) }
    }
    let acls = new PermissionSet(resource, acl, isContainer, aclOptions)
    acls.checkAccess(resource, user, mode)
      .then(hasAccess => {
        if (hasAccess) {
          debug(`${mode} access permitted to ${user}`)
          return callback()
        } else {
          debug(`${mode} access not permitted to ${user}`)
          return callback(new Error('Acl found but policy not found'))
        }
      })
      .catch(err => {
        debug(`${mode} access denied to ${user}`)
        debug(err)
        return callback(err)
      })
  }

  aclUrlFor (uri) {
    if (this.isAcl(uri)) {
      return uri
    } else {
      return uri + this.suffix
    }
  }

  isAcl (resource) {
    if (typeof resource === 'string') {
      return resource.endsWith(this.suffix)
    } else {
      return false
    }
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
