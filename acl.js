/*jslint node: true*/
/*jshint loopfunc:true */
"use strict";

var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var request = require('request');
var S = require('string');
var url = require('url');
var async = require('async');

var debug = require('./logging').ACL;
var file = require('./fileStore.js');
var ns = require('./vocab/ns.js').ns;
var rdfVocab = require('./vocab/rdf.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

ACL.prototype.findACL = function(mode, address, userId) {
    for (var i = 0; i < depth.length; i++) {
        var pathAcl = S(filepath).endsWith(ldp.suffixAcl) ?
                filepath : filepath + ldp.suffixAcl;
        var pathUri = file.filenameToBaseUri(filepath, acl.uri, ldp.root);
        relativePath = path.relative(ldp.root, filepath);

        debug("Checking " + accessType + "<" + mode + "> to " +
            pathUri + " for WebID: " + userId);
        debug("Looking for policies in " + pathAcl);

        var aclData;
        var aclGraph = $rdf.graph();
        try {
            aclData = fs.readFileSync(pathAcl, {encoding: 'utf8'});
            $rdf.parse(aclData, aclGraph, pathUri, 'text/turtle');
        } catch (parseErr) {
            debug("Error parsing ACL policy: " + parseErr);
            //Resetting graph to prevent the code from taking the next if brach.
            aclGraph = $rdf.graph();
        }


        if (aclGraph.statements.length > 0) {
            debug("Found policies in " + pathAcl);
            var controlStatements = aclGraph.each(undefined, ns.acl("mode"),
                ns.acl("Control"));
            for(var controlIndex in controlStatements) {
                var controlElem = controlStatements[controlIndex];

                var accessStatements = aclGraph.each(controlElem,
                    ns.acl(accessType), aclGraph.sym(pathUri));
                for(var accessIndex in accessStatements) {
                    var accessElem = accessStatements[accessIndex];

                    var originsControl = aclGraph.each(modeElem, ns.acl("origin"), undefined);
                    var originControlValue;
                    if (acl.origin.length > 0 && originsControl.length > 0) {
                        debug("Origin set to: " + rdfVocab.brack(acl.origin));
                        for(var originsControlIndex in originsControl) {
                            var originsControlElem = originsControl[originsControlIndex];
                            if (rdfVocab.brack(acl.origin) === originsControlElem.toString()) {
                                debug("Found policy for origin: " +
                                    originsControlElem.toString());
                                originControlValue = acl.allowOrigin(mode, userId, aclGraph, controlElem);
                                if (originControlValue) {
                                    return originControlValue;
                                }
                            }
                        }
                        continue;
                    } else {
                        debug("No origin found, moving on.");
                    }
                    originControlValue = acl.allowOrigin(mode, userId, aclGraph, controlElem);
                    if (originControlValue) {
                        return originControlValue;
                    }

                    var ownerStatements = aclGraph.each(accessElem,
                        ns.acl("owner"), aclGraph.sym(userId));
                    for(var ownerIndex in ownerStatements) {
                        debug(mode + " access allowed (as owner)" +
                            " for: " + userId);
                        return {
                            status: 200,
                            err: null
                        };
                    }

                    var agentStatements = aclGraph.each(controlElem,
                        ns.acl("agent"), aclGraph.sym(userId));
                    for(var agentIndex in agentStatements) {
                        debug(mode + " access allowed (as agent)" +
                            " for: " + userId);
                        return {
                            status: 200,
                            err: null
                        };
                    }

                    var agentClassStatements = aclGraph.each(controlElem,
                        ns.acl("agentClass"), undefined);
                    for (var agentClassIndex in agentClassStatements) {
                        var agentClassElem = agentClassStatements[agentClassIndex];
                        debug("Found agentClass policy");
                        if (agentClassElem.sameTerm(ns.foaf("Agent"))) {
                            debug(mode +
                                " access allowed as FOAF agent");
                            return {
                                status: 200,
                                err: null
                            };
                        }

                        var groupURI = rdfVocab.debrack(agentClassElem.toString());
                        var groupGraph = $rdf.graph();
                        acl.fetchDocument(groupGraph, groupURI, req);
                        var typeStatements = groupGraph.each(agentClassElem,
                            ns.rdf("type"), ns.foaf("Group"));
                        if (groupGraph.statements.length > 0 &&
                            typeStatements.length > 0) {
                            var memberStatements = groupGraph.each(
                                agentClassElem, ns.foaf("member"),
                                groupGraph.sym(userId));
                            for(var memberIndex in memberStatements) {
                                debug(userId +
                                    " listed as member of the group " + groupURI);
                                return {
                                    status: 200,
                                    err: null
                                };
                            }
                        }
                    }
                }
            }

            var modeStatements = aclGraph.each(undefined, ns.acl("mode"), ns.acl(mode));
            for(var modeIndex in modeStatements) {
                var modeElem = modeStatements[modeIndex];
                debug("Found " + accessType + " policy for <" + mode + ">");
                var accessTypeStatements = aclGraph.each(modeElem, ns.acl(accessType),
                    aclGraph.sym(pathUri));
                for(var accessTypeIndex in accessTypeStatements) {
                    var accessTypeElem = accessTypeStatements[accessTypeIndex];
                    var origins = aclGraph.each(modeElem, ns.acl("origin"), undefined);
                    var originValue;
                    if (acl.origin.length > 0 && origins.length > 0) {
                        debug("Origin set to: " + rdfVocab.brack(acl.origin));
                        for(var originsIndex in origins) {
                            var originsElem = origins[originsIndex];
                            if (rdfVocab.brack(acl.origin) === originsElem.toString()) {
                                debug("Found policy for origin: " +
                                    originsElem.toString());
                                originValue = acl.allowOrigin(mode, userId, aclGraph, modeElem);
                                if (originValue) {
                                    return originValue;
                                }
                            }
                        }
                        continue;
                    } else {
                        debug("No origin found, moving on.");
                    }
                    originValue = acl.allowOrigin(mode, userId, aclGraph, modeElem);
                    if (originValue) {
                        return originValue;
                    }
                }
            }

            if (userId.length === 0 || acl.session.identified === false)  {
                debug("Authentication required");
                return {
                    status: 401,
                    err: "Access to " + pathUri + " requires authorization"
                };
            }
            debug(mode + " access denied for: " + userId);
            return {
                status: 403,
                err: "Access denied for " + userId
            };
        }

        accessType = "defaultForNew";
        if (i === 0) {
            if (path.dirname(path.dirname(relativePath)) == '.') {
                filepath = ldp.root;
            } else {
                filepath = ldp.root + path.dirname(relativePath);
            }
        } else {
            if (relativePath.length === 0) {
                break;
            } else if (path.dirname(path.dirname(relativePath)) === '.') {
                filepath = ldp.root;
            } else {
                filepath = ldp.root + path.dirname(relativePath);
            }
        }

        if (!S(filepath).endsWith("/")) {
            filepath += "/";
        }
    }

    debug("No ACL policies present - access allowed");
    return {
        status: 200,
        err: null
    };
};

ACL.prototype.allow = function(mode, address, callback) {
    var ldp = this.ldp;
    var acl = this;
    var accessType = "accessTo";
    var filepath = file.uriToFilename(address, ldp.root);
    var relativePath = file.uriToRelativeFilename(address, ldp.root);

    async.waterfall([
        acl.getUserId,
        acl.findACL
    ], callback);
};

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

        // TODO can I just create the empty graph?
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
                    cb(err, body);
                });
            }
            // Fetch URL
            var newPath = S(uri).chompLeft(acl.uri).s;
            // TODO prettify this
            var documentPath = file.uriToFilename(newPath, ldp.root);
            var documentUri = url.parse(documentPath);
            documentPath = documentUri.pathname;


            acl.allow('Read', newPath, function (err, readAllowed) {
                if (readAllowed && readAllowed.status === 200) {
                   fs.readFile(documentPath, {encoding: 'utf8'}, cb);
                }
            });
        },
        function (body, cb) {
            try {
                $rdf.parse(body, graph, uri, 'text/turtle');
                // TODO, check what to return
                return cb(null, graph);
            } catch(err) {
                return cb(err, graph);
            }
        }
    ], callback);
};

ACL.prototype.getUserId = function (callback) {
    if (!this.onBehalfOf) {
        return callback(null, this.session.userId);
    }

    var delegator = rdfVocab.debrack(this.onBehalfOf);
    this.verifyDelegator(delegator, this.session.userId, function(err, res) {
        if (res) {
            debug("Request User ID (delegation) :" + delegator);
            return callback(null, delegator);
        }
        return callback(null, this.session.userId);
    });
};

function reqToACL (req) {
    return new ACL({
        onBehalfOf: req.get('On-Behalf-Of'),
        session: req.session,
        uri: file.uriBase(req),
        ldp: req.app.locals.ldp,
        origin: req.get('origin')
    });
}

function ACL (opts) {
    opts = opts || {};
    this.onBehalfOf = opts.onBehalfOf;
    this.session = opts.session;
    this.uri = opts.uri;
    this.ldp = opts.ldp;
    this.origin = opts.origin || '';
}

ACL.prototype.verifyDelegator = function (delegator, delegatee, callback) {
    this.fetchDocument(delegator, function(err, delegatorGraph) {

        // TODO handle error

        var delegatesStatements = delegatorGraph
            .each(delegatorGraph.sym(delegator),
                  delegatorGraph.sym("http://www.w3.org/ns/auth/acl#delegates"),
                  undefined);
        for(var delegateeIndex in delegatesStatements) {
            var delegateeValue = delegatesStatements[delegateeIndex];
            if (rdfVocab.debrack(delegateeValue.toString()) === delegatee) {
                callback(null, true);
            }
        }
        // TODO check if this should be false
        return callback(null, false);
    });
};

function allowIfACLEnabled(mode, req, res, next) {
    var ldp = req.app.locals.ldp;
    if (!ldp.webid) {
        return next();
    }
    // TODO second parameter is newPath
    return allow(mode, req, res, next);
}

function allow(mode, req, res, next) {
    var ldp = req.app.locals.ldp;

    //Handle glob requests
    var filepath = file.uriToFilename(req.path, ldp.root);
    if (req.method === 'GET' && glob.hasMagic(filepath)) {
        return next();
    }

    // Check ACL
    var acl = reqToACL(req);
    acl.allow(mode, req.path, function(err, allow) {
        // TODO handle error
        if (allow.status != 200) {
            return res
                .status(allow.status)
                .send(allow.err);
        }
        return next();
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
    
    var allowAppendValue = allow("Append", req);
    if (allowAppendValue.status == 200) {
        return next();
    }

    var allowWriteValue = allow("Write", req);
    if (allowWriteValue.status == 200) {
        return next();
    }

    return res
        .status(allowWriteValue.status)
        .send(allowWriteValue.err);
};

exports.allowControlHandler = function(req, res, next) {
    allowIfACLEnabled("Control", req, res, next);
};