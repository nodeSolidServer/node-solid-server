/*jslint node: true*/
/*jshint loopfunc:true */
"use strict";
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var request = require('request');
var S = require('string');
var url = require('url');
var async = require('async');

var debug = require('./debug').ACL;
var utils = require('./utils.js');
var ns = require('./vocab/ns.js').ns;
var rdfVocab = require('./vocab/rdf.js');
var HttpError = require('./http-error');
var ACL = require('solid-acl');

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function match (graph, s, p, o) {
    var matches = graph.each(s ? $rdf.sym(s) : undefined, $rdf.sym(p), $rdf.sym(o));
    console.log(matches)
    return matches
}

function fetchDocument (ldp, baseUri) {
    return function (uri, callback) {
        var graph = $rdf.graph();
        async.waterfall([
            function (cb) {
                // URL is remote
                if (!S(uri).startsWith(baseUri)) {
                    // Fetch remote source
                    var headers = { headers: { 'Accept': 'text/turtle'}};
                    return request.get(uri, headers, function(err, response, body) {
                        return cb(err, body);
                    });
                }
                // URL is local
                var newPath = S(uri).chompLeft(baseUri).s;
                // TODO prettify this
                var documentPath = utils.uriToFilename(newPath, ldp.root);
                var documentUri = url.parse(documentPath);
                documentPath = documentUri.pathname;
                return ldp.readFile(documentPath, cb);
            },
            function (body, cb) {
                try {
                    $rdf.parse(body, graph, uri, 'text/turtle');
                } catch(err) {
                    console.log(err)
                    return cb(err, graph);
                }
                return cb(null, graph);
            }
        ], callback);
    }
}

function getUserId (req, callback) {
    var onBehalfOf = req.get('On-Behalf-Of')
    if (!onBehalfOf) {
        return callback(null, req.session.userId);
    }

    var delegator = rdfVocab.debrack(onBehalfOf);
    verifyDelegator(delegator, req.session.userId, function(err, res) {
        if (res) {
            debug("Request User ID (delegation) :" + delegator);
            return callback(null, delegator);
        }
        return callback(null, req.session.userId);
    });
};

function verifyDelegator (ldp, baseUri, delegator, delegatee, callback) {
    fetchDocument(ldp, baseUri)(delegator, function(err, delegatorGraph) {

        // TODO handle error
        var delegatesStatements = delegatorGraph
            .each(delegatorGraph.sym(delegator),
                  delegatorGraph.sym("http://www.w3.org/ns/auth/acl#delegates"),
                  undefined);

        for (var delegateeIndex in delegatesStatements) {
            var delegateeValue = delegatesStatements[delegateeIndex];
            if (rdfVocab.debrack(delegateeValue.toString()) === delegatee) {
                callback(null, true);
            }
        }
        // TODO check if this should be false
        return callback(null, false);
    });
};
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
        var ldp = req.app.locals.ldp;
        if (!ldp.webid) {
            return next();
        }
        var baseUri = utils.uriBase(req)

        var acl = new ACL({
            fetch: fetchDocument(ldp, baseUri),
            match: match,
            suffix: ldp.suffixAcl
        })

        getUserId(req, function(err, userId) {
            if (err) return callback(err);

            var reqPath = res && res.locals && res.locals.path ? res.locals.path : req.path;
            var options = {
                origin: req.get('origin')
            }
            return acl.can(userId, mode, baseUri + reqPath, next, options)
        })
    }
}

exports.allow = allow;
