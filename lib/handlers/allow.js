module.exports.allow = allow

var ACL = require('../acl-checker')
var $rdf = require('rdflib')
var url = require('url')
var async = require('async')
var debug = require('../debug').ACL
var utils = require('../utils')

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function allow (mode) {
  return function allowHandler (req, res, next) {
    var ldp = req.app.locals.ldp
    if (!ldp.webid) {
      return next()
    }
    var baseUri = utils.uriBase(req)

    var acl = new ACL({
      debug: debug,
      fetch: fetchDocument(req.hostname, ldp, baseUri),
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

function fetchDocument (host, ldp, baseUri) {
  return function (uri, callback) {
    var graph = $rdf.graph()
    async.waterfall([
      function (cb) {
        // URL is local
        // S(uri).chompLeft(baseUri).s
        var newPath = uri.startsWith(baseUri)
          ? uri.slice(baseUri.length)
          : uri
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
