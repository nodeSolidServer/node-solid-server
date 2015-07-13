/*jslint node: true*/
/*jshint loopfunc:true */
"use strict";

var fs = require('fs');
var glob = require('glob');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var debug = require('./logging').ACL;
var file = require('./fileStore.js');
var ns = require('./vocab/ns.js').ns;
var rdfVocab = require('./vocab/rdf.js');

function allow(mode, req, res) {
    var options = req.app.locals.ldp;
    var origin = req.get('origin');
    origin = origin ? origin : '';

    var accessType = "accessTo";

    var filepath = file.uriToFilename(req.path, options.base);
    var relativePath = file.uriToRelativeFilename(req.path, options.base);
    var depth = relativePath.split('/');

    //Handle glob requests
    if (req.method === 'GET' && glob.hasMagic(filepath)) {
        return {
            status: 200,
            err: null
        };
    }

    for (var i = 0; i < depth.length; i++) {
        var pathAcl = S(filepath).endsWith(options.suffixAcl) ?
                filepath : filepath + options.suffixAcl;
        var uri = options.uri || file.uriAbs(req);
        var pathUri = file.filenameToBaseUri(filepath, uri, options.base);
        relativePath = path.relative(options.base, filepath);

        debug("Checking " + accessType + "<" + mode + "> to " +
            pathUri + " for WebID: " + req.session.userId);
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
                    if (origin.length > 0 && originsControl.length > 0) {
                        debug("Origin set to: " + rdfVocab.brack(origin));
                        for(var originsControlIndex in originsControl) {
                            var originsControlElem = originsControl[originsControlIndex];
                            if (rdfVocab.brack(origin) === originsControlElem.toString()) {
                                debug("Found policy for origin: " +
                                    originsControlElem.toString());
                                originControlValue = allowOrigin(mode, req, res, aclGraph, controlElem);
                                if (originControlValue) {
                                    return originControlValue;
                                }
                            }
                        }
                        continue;
                    } else {
                        debug("No origin found, moving on.");
                    }
                    originControlValue = allowOrigin(mode, req, res, aclGraph, controlElem);
                    if (originControlValue) {
                        return originControlValue;
                    }

                    var ownerStatements = aclGraph.each(accessElem,
                        ns.acl("owner"), aclGraph.sym(req.session.userId));
                    for(var ownerIndex in ownerStatements) {
                        debug(mode + " access allowed (as owner)" +
                            " for: " + req.session.userId);
                        return {
                            status: 200,
                            err: null
                        };
                    }

                    var agentStatements = aclGraph.each(controlElem,
                        ns.acl("agent"), aclGraph.sym(req.session.userId));
                    for(var agentIndex in agentStatements) {
                        debug(mode + " access allowed (as agent)" +
                            " for: " + req.session.userId);
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
                        var groupFetcher = $rdf.fetcher(groupGraph, 3000, false);
                        groupFetcher.nowOrWhenFetched(groupURI, null, function(ok, err) {});
                        var typeStatements = groupGraph.each(agentClassElem,
                            ns.rdf("type"), ns.foaf("Group"));
                        if (groupGraph.statements.length > 0 &&
                            typeStatements.length > 0) {
                            var memberStatements = groupGraph.each(
                                agentClassElem, ns.foaf("member"),
                                groupGraph.sym(req.session.userId));
                            for(var memberIndex in memberStatements) {
                                debug(req.session.userId +
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
                    if (origin.length > 0 && origins.length > 0) {
                        debug("Origin set to: " + rdfVocab.brack(origin));
                        for(var originsIndex in origins) {
                            var originsElem = origins[originsIndex];
                            if (rdfVocab.brack(origin) === originsElem.toString()) {
                                debug("Found policy for origin: " +
                                    originsElem.toString());
                                originValue = allowOrigin(mode, req, res, aclGraph, modeElem);
                                if (originValue) {
                                    return originValue;
                                }
                            }
                        }
                        continue;
                    } else {
                        debug("No origin found, moving on.");
                    }
                    originValue = allowOrigin(mode, req, res, aclGraph, modeElem);
                    if (originValue) {
                        return originValue;
                    }
                }
            }

            if (req.session.userId.length === 0 || req.session.identified === false)  {
                debug("Authentication required");
                return {
                    status: 401,
                    err: "Access to " + pathUri + " requires authorization"
                };
            }
            debug(mode + " access denied for: " + req.session.userId);
            return {
                status: 403,
                err: "Access denied for " + req.session.userId
            };
        }

        accessType = "defaultForNew";
        if (i === 0) {
            if (path.dirname(path.dirname(relativePath)) == '.') {
                filepath = options.base;
            } else if (S(relativePath).endsWith("/")) {
                filepath = options.base + path.dirname(path.dirname(relativePath));
            } else {
                filepath = options.base + path.dirname(relativePath);
            }
        } else {
            if (relativePath.length === 0) {
                break;
            } else if (path.dirname(path.dirname(relativePath)) === '.') {
                filepath = options.base;
            } else {
                filepath = options.base + path.dirname(path.dirname(relativePath));
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
}

function allowOrigin(mode, req, res, aclGraph, subject) {
    debug("In allow origin");
    var ownerStatements = aclGraph.each(subject, ns.acl("owner"),
        aclGraph.sym(req.session.userId));
    for (var ownerIndex in ownerStatements) {
        debug(mode + " access allowed (as owner) for: " + req.session.userId);
        return {
            status: 200,
            err: null
        };
    }
    var agentStatements = aclGraph.each(subject, ns.acl("agent"),
        aclGraph.sym(req.session.userId));
    for (var agentIndex in agentStatements) {
        debug(mode + " access allowed (as agent) for: " + req.session.userId);
        return {
            status: 200,
            return: null
        };
    }
    var agentClassStatements = aclGraph.each(subject, ns.acl("agentClass"), undefined);
    for (var agentClassIndex in agentClassStatements) {
        var agentClassElem = agentClassStatements[agentClassIndex];
        //Check for FOAF groups
        debug("Found agentClass policy");
        if (agentClassElem.sameTerm(ns.foaf("Agent"))) {
            debug(mode + " allowed access as FOAF agent");
            return {
                status: 200,
                err: null
            };
        }
        var groupURI = rdfVocab.debrack(agentClassElem.toString());
        var groupGraph = $rdf.graph();
        var groupFetcher = $rdf.fetcher(groupGraph, 3000, false);
        groupFetcher.nowOrWhenFetched(groupURI, null, function(ok, err) {});
        var typeStatements = groupGraph.each(agentClassElem, ns.rdf("type"), ns.foaf("Group"));
        if (groupGraph.statements.length > 0 && typeStatements.length > 0) {
            var memberStatements = groupGraph.each(agentClassElem, ns.foaf("member"),
                groupGraph.sym(req.session.userId));
            for (var memberIndex in memberStatements) {
                debug(req.session.userId + " listed as member of the group " + groupURI);
                return {
                    status: 200,
                    err: null
                };
            }
        }
    }
}

function allowIfACLEnabled(mode, req, res, next) {
    var options = req.app.locals.ldp;
    if (!options.webid) {
        return next();
    } else {
        var allowValue = allow(mode, req, res, next);
        if (allowValue.status == 200) {
            return next();
        } else {
            return res.status(allowValue.status).send(allowValue.err);
        }
    }
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
    var options = req.app.locals.ldp;
    if (!options.webid) {
        return next();
    } else {
        var allowAppendValue = allow("Append", req, res, next);
        if (allowAppendValue.status == 200) {
            return next();
        } else {
            var allowWriteValue = allow("Write", req, res, next);
            if(allowWriteValue.status == 200) {
                return next();
            } else {
                return res.status(allowWriteValue.status).send(allowWriteValue.err);
            }
        }
    }
};

exports.allowControlHandler = function(req, res, next) {
    allowIfACLEnabled("Control", req, res, next);
};
