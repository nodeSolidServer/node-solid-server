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

// TODO should this be set?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function ACL (opts) {
    opts = opts || {};
    this.onBehalfOf = opts.onBehalfOf;
    this.session = opts.session;
    this.uri = opts.uri;
    this.ldp = opts.ldp;
    this.origin = opts.origin || '';
}
exports.ACL = ACL;

/**
* Gets an ACL file and parses it
*
* @method readACL
* @param {String} pathACL Path to acl file
* @param {String} pathUri URI of the acl file
* @param {ACL~readACLcb} callback Callback called when ACL is read
*/
ACL.prototype.readACL = function(pathAcl, pathUri, callback) {
    var ldp = this.ldp;
    var acl = this;

    ldp.readFile(pathAcl, function(err, aclData) {
        if (err) {
            debug("Error parsing ACL policy: " + err.message);
            return callback(err);
        }

        var aclGraph = $rdf.graph();
        try {
            $rdf.parse(aclData, aclGraph, pathUri, 'text/turtle');
        } catch (err) {
            debug("Error parsing ACL policy: " + err);
            return callback(new HttpError({
                status: 500,
                message: err.message
            }));
        }

        return callback(null, aclGraph);
    });
};
/**
 * Callback used by readACL.
 * @callback ACL~readACLcb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {Object} aclGraph Acl graph after reading the file
 */

ACL.prototype.findACLinPath = function (mode, pathAcl, pathUri, aclGraph, accessType, userId, callback) {
    var acl = this;

    // TODO check if this is necessary
    if (aclGraph.statements.length === 0) {
        debug("No policies found in " + pathAcl);
        return callback(null, false);
    }

    debug("Found policies in " + pathAcl);
    acl.allowControl(mode, userId, aclGraph, accessType, pathUri, function(found) {
        if (found) {
            return callback(null, true);
        }

        acl.allowMode(mode, userId, aclGraph, accessType, pathUri, function(found) {
            if (found) {
                return callback(null, true);
            }

            // User is authenticated
            if (userId.length === 0 || !acl.session || acl.session.identified === false)  {
                debug("Authentication required");
                return callback(new HttpError({
                    status: 401,
                    message: "Access to " + pathUri + " requires authorization"
                }));
            }
            // No ACL statement found, access is denied
            debug(mode + " access denied for: " + userId);
            return callback(new HttpError({
                status: 403,
                message: "Access denied for " + userId
            }));
        });
    });

};
/**
 * Callback used by findACLinPath.
 * @callback ACL~findACLinPath_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {Boolean} result Found valid ACL statement
 */

ACL.prototype.findACL = function(mode, address, userId, callback) {
    var ldp = this.ldp;
    var acl = this;
    var accessType = "accessTo";
    var filepath = utils.uriToFilename(address, ldp.root);
    var relativePath = utils.uriToRelativeFilename(address, ldp.root);
    var i = 0;
    var depth = relativePath.split('/');

    async.whilst(
        // Check if we have gone through all the `/` in relativePath
        function() {
            return i++ < depth.length;
        },
        function (done) {
            var pathAcl = S(filepath).endsWith(ldp.suffixAcl) ?
                filepath : filepath + ldp.suffixAcl;
            var pathUri = utils.filenameToBaseUri(filepath, acl.uri, ldp.root);
            var relativePath = path.relative(ldp.root, filepath);
            // debug('relativePath = ' + relativePath);

            debug("Checking " + accessType + "<" + mode + "> to " + pathUri + " for WebID: " + userId);
            debug("Looking for policies in " + pathAcl);

            acl.readACL(pathAcl, pathUri, function(err, aclGraph) {
                // Assume an empty graph
                if (err) {
                    aclGraph = $rdf.graph();
                }

                acl.findACLinPath(mode, pathAcl, pathUri, aclGraph, accessType, userId, function(err, found) {
                    // Error occurred (e.g. file not found)
                    if (err) {
                        // debug('FindACLInPath failed in ' + pathAcl + ' with error ' + err.message);
                        return done(err);
                    }

                    // ACL rule that allow the userId to read is found
                    if (found) {
                        // debug('FindACLinPath not found');
                        return done(true);
                    }

                    // if we have iterated through all the relativePaths
                    // and it is not the first iteration
                    if (relativePath.length === 0 && i !== 0) {
                        return done(true);
                    }

                    // Set the new path for the next loop iteration
                    accessType = "defaultForNew";
                    if (path.dirname(path.dirname(relativePath)) === '.') {
                        filepath = ldp.root;
                    } else {
                        filepath = ldp.root + path.dirname(relativePath);
                    }
                    // add pending '/'
                    if (!S(filepath).endsWith("/")) {
                        filepath += "/";
                    }
                    return done(false);
                });
            });
        },
        function (result) {
            // result is false when no policy is found
            if (!result) {
                debug("No ACL policies present - access allowed");
                return callback(null);
            }

            // result is true if ACL statement is found
            if (result === true) {
                debug("ACL allowed");
                return callback(null);
            }

            // result is an object (since result !== true)
            // the object is of the type {status: 40[0-9], message: String}
            return callback(result);
        }
    );
};
/**
 * Callback used by findACL.
 * @callback ACL~findACL_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 */

ACL.prototype.allowMode = function (mode, userId, aclGraph, accessType, pathUri, callback) {
    var acl = this;

    var modeStatements = aclGraph.each(undefined, ns.acl("mode"), ns.acl(mode));
    async.some(modeStatements, function(modeElem, found) {
        debug("Found " + accessType + " policy for <" + mode + ">");

        var accessTypeStatements = aclGraph.each(modeElem, ns.acl(accessType), aclGraph.sym(pathUri));
        async.some(accessTypeStatements, function(accessTypeElem, next) {
            var origins = aclGraph.each(modeElem, ns.acl("origin"), undefined);
            if (acl.origin.length > 0 && origins.length > 0) {
                debug("Origin set to: " + rdfVocab.brack(acl.origin));
                async.some(origins, function(originsElem, done) {
                    if (rdfVocab.brack(acl.origin) === originsElem.toString()) {
                        debug("Found policy for origin: " + originsElem.toString());
                        return acl.allowOrigin(mode, userId, aclGraph, modeElem, done);
                    }
                    return done(false);
                }, next);
            } else {
                debug("No origin found, moving on.");
                acl.allowOrigin(mode, userId, aclGraph, modeElem, next);
            }
        }, found);
    }, function (allowed) {
        return callback(allowed);
    });
};

/**
 * Callback used by allowMode.
 * @callback ACL~allowMode_cb
 * @param {Boolean} result Found valid ACL statement
 */
ACL.prototype.allowControl = function (mode, userId, aclGraph, accessType, pathUri, callback) {
    var acl = this;

    var controlStatements = aclGraph.each(
        undefined,
        ns.acl("mode"),
        ns.acl("Control"));

    async.some(controlStatements, function(controlElem, done) {
        var accessStatements = aclGraph.each(
            controlElem,
            ns.acl(accessType),
            aclGraph.sym(pathUri));

        async.some(accessStatements, function(accessElem, found) {
            acl.allowOrigin(mode, userId, aclGraph, controlElem, found);
        }, done);

    }, callback);
};

/**
 * Callback used by allowControl.
 * @callback ACL~allowControl_cb
 * @param {Boolean} result Found valid ACL statement
 */
ACL.prototype.allow = function(mode, address, callback) {
    var ldp = this.ldp;
    var acl = this;

    acl.getUserId(function(err, userId) {
        if (err) {
            return callback(err);
        }
        acl.findACL(mode, address, userId, function(err) {
            return callback(err);
        });
    });
};
/**
 * Callback used by allow.
 * @callback ACL~allow_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 */

ACL.prototype.allowOrigin = function (mode, userId, aclGraph, subject, callback) {
    var acl = this;

    debug("In allow origin");

    // Owner statement
    var ownerStatements = aclGraph.each(
        subject,
        ns.acl("owner"),
        aclGraph.sym(userId));

    for (var ownerIndex in ownerStatements) {
        debug(mode + " access allowed (as owner) for: " + userId);
        return callback(true);
    }

    // Agent statement
    var agentStatements = aclGraph.each(
        subject,
        ns.acl("agent"),
        aclGraph.sym(userId));

    for (var agentIndex in agentStatements) {
        debug(mode + " access allowed (as agent) for: " + userId);
        return callback(true);
    }

    // Agent class statement
    var agentClassStatements = aclGraph.each(
        subject,
        ns.acl("agentClass"),
        undefined);

    if (agentClassStatements.length === 0) {
        return callback(false);
    }

    async.some(agentClassStatements, function (agentClassElem, found){
        //Check for FOAF groups
        debug("Found agentClass policy");
        if (agentClassElem.sameTerm(ns.foaf("Agent"))) {
            debug(mode + " allowed access as FOAF agent");
            return found(true);
        }
        var groupURI = rdfVocab.debrack(agentClassElem.toString());

        acl.fetchDocument(groupURI, function(err, groupGraph) {
            // Type statement
            var typeStatements = groupGraph.each(
                agentClassElem,
                ns.rdf("type"),
                ns.foaf("Group"));

            if (groupGraph.statements.length > 0 && typeStatements.length > 0) {
                var memberStatements = groupGraph.each(
                    agentClassElem,
                    ns.foaf("member"),
                    groupGraph.sym(userId));

                for (var memberIndex in memberStatements) {
                    debug(userId + " listed as member of the group " + groupURI);
                    return found(true);
                }
            }
            return found(false);
        });
    }, callback);
};
/**
 * Callback used by allowOrigin.
 * @callback ACL~allowOrigin_cb
 * @param {Boolean} result Found valid ACL statement
 */

ACL.prototype.fetchDocument = function(uri, callback) {
    var acl = this;
    var ldp = acl.ldp;
    var graph = $rdf.graph();

    async.waterfall([
        function (cb) {
            // URL is remote
            if (!S(uri).startsWith(acl.uri)) {
                // Fetch remote source
                var headers = { headers: { 'Accept': 'text/turtle'}};
                return request.get(uri, headers, function(err, response, body) {
                    return cb(err, body);
                });
            }
            // Fetch URL
            var newPath = S(uri).chompLeft(acl.uri).s;
            // TODO prettify this
            var documentPath = utils.uriToFilename(newPath, ldp.root);
            var documentUri = url.parse(documentPath);
            documentPath = documentUri.pathname;
            acl.allow('Read', newPath, function (err) {
                if (err) {
                    // return an empty body to be parsed
                    return cb(null, '');
                }

                return ldp.readFile(documentPath, cb);
            });
        },
        function (body, cb) {
            try {
                $rdf.parse(body, graph, uri, 'text/turtle');
            } catch(err) {
                return cb(err, graph);
            }

            return cb(null, graph);
        }
    ], callback);
};
/**
 * Callback used by fetchDocument.
 * @callback ACL~fetchDocument_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {Object} graph RDFlib graph of the fetched file
 */

/**
* Retrieves userId from session or header (On-Behalf-Of)
*
* @method getUserId
* @param {ACL~getUserId_cb} callback Callback called when UserId is retrieved
*/
ACL.prototype.getUserId = function (callback) {
    var acl = this;

    if (!acl.onBehalfOf) {
        return callback(null, this.session.userId);
    }

    var delegator = rdfVocab.debrack(acl.onBehalfOf);
    acl.verifyDelegator(delegator, acl.session.userId, function(err, res) {

        // TODO dle error

        if (res) {
            debug("Request User ID (delegation) :" + delegator);
            return callback(null, delegator);
        }
        return callback(null, acl.session.userId);
    });
};
/**
 * Callback used by getUserId.
 * @callback ACL~getUserId_cb
 * @param {Object} err Error occurred when reading the acl file
 * @param {Number} err.status Status code of the error (HTTP way)
 * @param {String} err.message Reason of the error
 * @param {String} userId User WebID
 */

/**
* Gets an ACL file and parses it
*
* @method verifyDelegator
* @param {String} delegator
* @param {String} delegatee
* @param {ACL~verifyDelegator_cb} callback
*/
ACL.prototype.verifyDelegator = function (delegator, delegatee, callback) {
    this.fetchDocument(delegator, function(err, delegatorGraph) {

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

function reqToACL (req) {
    return new ACL({
        onBehalfOf: req.get('On-Behalf-Of'),
        session: req.session,
        uri: utils.uriBase(req),
        ldp: req.app.locals.ldp,
        origin: req.get('origin')
    });
}

function allowIfACLEnabled(mode, req, res, next) {
    var ldp = req.app.locals.ldp;
    if (!ldp.webid) {
        return next();
    }
    return allow(mode, req, res, next);
}

function allow(mode, req, res, next) {
    var ldp = req.app.locals.ldp;

    // Handle glob requests
    var filepath = utils.uriToFilename(req.path, ldp.root);
    if (req.method === 'GET' && glob.hasMagic(filepath)) {
        return next();
    }

    // Check ACL
    var reqPath = res && res.locals && res.locals.path ? res.locals.path : req.path;
    var acl = reqToACL(req);
    acl.allow(mode, reqPath, function(err) {
        return next(err);
    });
}

exports.allow = allow;

exports.allowReadHandler = function(req, res, next) {
    allowIfACLEnabled("Read", req, res, next);
};

exports.allowWriteHandler = function(req, res, next) {
    allowIfACLEnabled("Write", req, res, next);
};

exports.allowAppendHandler = function(req, res, next) {
    allowIfACLEnabled("Append", req, res, next);
};

exports.allowAppendThenWriteHandler = function(req, res, next) {
    var ldp = req.app.locals.ldp;
    if (!ldp.webid) {
        return next();
    }

    allow("Append", req, res, function(err) {
        if (!err) {
            return next();
        }
        // Append failed, maybe user can write
        allow("Write", req, res, function(err) {
            return next(err);
        });
    });


};

exports.allowControlHandler = function(req, res, next) {
    allowIfACLEnabled("Control", req, res, next);
};
