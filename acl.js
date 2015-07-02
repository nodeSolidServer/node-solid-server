/*jslint node: true*/
/*jshint loopfunc:true */
"use strict";

var fs = require('fs');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');

var file = require('./fileStore.js');
var logging = require('./logging.js');
var options = require('./options.js');

var ns = require('./vocab/ns.js');
var rdfVocab = require('./vocab/rdf.js');

var aclExtension = ".acl";

function allow(mode, req, res) {
    var origin = req.get('Origin');
    var accessType = "accessTo";

    var filepath = file.uriToFilename(req.path);
    var relativePath = file.uriToRelativeFilename(req.path);
    var depth = relativePath.split('/');

    for (var i = 0; i < depth.length; i++) {
        var pathAcl = filepath + aclExtension;
        var pathUri = file.filenameToBaseUri(filepath);
        var pathAclUri = file.filenameToBaseUri(filepath + aclExtension);

        if (!fs.existsSync(filepath) || !fs.existsSync(pathAcl)) {
            continue;
        }

        logging.log("ACL -- Checking " + accessType + "<" + mode + "> to " +
            pathUri + " for WebID: " + req.session.userId);
        logging.log("ACL -- Looking for policies in " + pathAcl);

        var aclData;
        var aclGraph = $rdf.graph();
        try {
            aclData = fs.readFileSync(pathAcl);
            $rdf.parse(aclData, aclGraph, pathAclUri, 'text/turtle');
        } catch (parseErr) {
            //Resetting graph to prevent the code from taking the next if brach.
            aclGraph = $rdf.graph();
        }

        if (aclGraph.statements.length > 0) {
            logging.log("ACL -- Found policies in " + pathAcl);
            var controlStatements = aclGraph.any(undefined, ns.acl("mode"),
                ns.acl("Control"));
            controlStatements.forEach(function(controlElem) {
                var accessStatements = aclGraph.any(controlElem.subject,
                    ns.acl(accessType), aclGraph.sym(pathUri));
                accessStatements.forEach(function(accessElem, accessIndex) {
                    var ownerStatements = aclGraph.any(accessElem.subject,
                        ns.acl("owner"), aclGraph.sym(req.session.userId));
                    ownerStatements.forEach(function(ownerElem) {
                        logging.log("ACL -- " + mode + " access allowed (as owner)" +
                            " for: " + req.session.userId);
                        return {
                            status: 200,
                            err: null
                        };
                    });
                    var agentStatements = aclGraph.any(controlElem.subject,
                        ns.acl("agent"), aclGraph.sym(req.session.userId));
                    agentStatements.forEach(function(agentElem) {
                        logging.log("ACL -- " + mode + " access allowed (as agent)" +
                            " for: " + req.session.userId);
                        return {
                            status: 200,
                            err: null
                        };
                    });
                    var agentClassStatements = aclGraph.any(controlElem.subject,
                        ns.acl("agentClass"), undefined);
                    agentClassStatements.forEach(function(agentClassElem) {
                        logging.log("ACL -- Found agentClass policy");
                        if (agentClassElem.object.sameTerm(ns.foaf("Agent"))) {
                            logging.log("ACL -- " + mode +
                                " access allowed as FOAF agent");
                            return {
                                status: 200,
                                err: null
                            };
                        }

                        var groupURI = rdfVocab.debrack(agentClassElem.object.toString());
                        var groupGraph = $rdf.graph();
                        var groupFetcher = $rdf.fetcher(groupGraph, 3000, false);
                        groupFetcher.nowOrWhenFetched(groupURI, null, function(ok, err) {});
                        var typeStatements = groupGraph.any(agentClassElem.object,
                            ns.rdf("type"), ns.foaf("Group"));
                        if (groupGraph.statements.length > 0 &&
                            typeStatements.length > 0) {
                            var memberStatements = groupGraph.any(
                                agentClassElem.object, ns.foaf("member"),
                                groupGraph.sym(req.session.userId));
                            memberStatements.forEach(function(memberElem) {
                                logging.log("ACL -- " + req.session.userId +
                                    " listed as member of the group " + groupURI);
                                return {
                                    status: 200,
                                    err: null
                                };
                            });
                        }
                    });
                });
            });

            var modeStatements = aclGraph.any(undefined, ns.acl("mode"), ns.acl(mode));
            modeStatements.forEach(function(modeElem) {
                logging.log("ACL -- Found " + accessType + " policy for <" + mode + ">");

                var accessTypeStatements = aclGraph.any(modeElem.subject, ns.acl(accessType),
                    aclGraph.sym(pathUri));
                accessTypeStatements.forEach(function(accessTypeElem) {
                    var origins = aclGraph.any(modeElem.subject, ns.acl("origin"), undefined);
                    if (origin.length > 0 && origins.length > 0) {
                        logging.log("ACL -- Origin set to: " + rdfVocab.brack(origin));
                        origins.forEach(function(originsElem) {
                            if (rdfVocab.brack(origin) === originsElem.object.toString()) {
                                logging.log("ACL -- Found policy for origin: " +
                                    originsElem.object.toString());
                                return allowOrigin(mode, req, res, aclGraph, accessTypeElem);
                            }
                        });
                    } else {
                        logging.log("ACL -- No origin found, moving on.");
                    }
                    return allowOrigin(mode, req, res, aclGraph, accessTypeElem);
                });
            });

            if (req.session.userId.length === 0 || req.session.identified === false)  {
                logging.log("ACL -- Authentication required");
                return {
                    status: 401,
                    err: "Access to " + pathUri + " requires authorization"
                };
            }
            logging.log("ACL -- " + mode + " access denied for: " + req.session.userId);
            return {
                status: 403,
                err: "Access denied for " + req.session.userId
            };
        }

        accessType = "defaultForNew";
        if (i === 0) {
            if (S(filepath).endsWith('/')) {
                if (path.dirname(path.dirname(filepath)) === ".") {
                    filepath = options.fileBase;
                } else {
                    filepath = options.fileBase + path.dirname(path.dirname(filepath));
                }
            }
        } else {
            if (filepath.length === 0) {
                break;
            } else if (path.dirname(path.dirname(filepath)) === ".") {
                filepath = options.fileBase;
            } else {
                filepath = options.fileBase + path.dirname(path.dirname(filepath));
            }
        }

        filepath += "/";
    }
    logging.log("ACL -- No ACL policies present - access allowed");
    return {
        status: 200,
        err: null
    };
}

function allowOrigin(mode, req, res, aclGraph, triple) {
    logging.log("ACL -- In allow origin");
    var ownerStatements = aclGraph.any(triple.subject, ns.acl("owner"),
        aclGraph.sym(req.session.userId));
    ownerStatements.forEach(function(ownerElem) {
        logging.log("ACL -- " + mode + " access allowed (as owner) for: " + req.session.userId);
        return {
            status: 200,
            err: null
        };
    });
    var agentStatements = aclGraph.any(triple.subject, ns.acl("agent"),
        aclGraph.sym(req.session.userId));
    agentStatements.forEach(function(agentElem) {
        logging.log("ACL -- " + mode + " access allowed (as agent) for: " + req.session.userId);
        return {
            status: 200,
            return: null
        };
    });
    var agentClassStatements = aclGraph.any(triple.subject, ns.acl("agentClass"), undefined);
    agentClassStatements.forEach(function(agentClassElem) {
        //Check for FOAF groups
        logging.log("ACL -- Found agentClass policy");
        if (agentClassElem.object.sameTerm(ns.foaf("Agent"))) {
            logging.log("ACL -- " + mode + " allowed access as FOAF agent");
            return {
                status: 200,
                err: null
            };
        }
        var groupURI = rdfVocab.debrack(agentClassElem.object.toString());
        var groupGraph = $rdf.graph();
        var groupFetcher = $rdf.fetcher(groupGraph, 3000, false);
        groupFetcher.nowOrWhenFetched(groupURI, null, function(ok, err) {});
        var typeStatements = groupGraph.any(agentClassElem.object, ns.rdf("type"), ns.foaf("Group"));
        if (groupGraph.statements.length > 0 && typeStatements.length > 0) {
            var memberStatements = groupGraph.any(agentClassElem.object, ns.foaf("member"),
                groupGraph.sym(req.session.userId));
            memberStatements.forEach(function(memberElem) {
                logging.log("ACL -- " + req.session.userId + " listed as member of the group " + groupURI);
                return {
                    status: 200,
                    err: null
                };
            });
        }
    });
}

function allowIfACLEnabled(mode, req, res, next) {
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

exports.allowReadHandler = function(req, res, next) {
    allowIfACLEnabled("Read", req, res, next);
};

exports.allowWriteHandler = function(req, res, next) {
    allowIfACLEnabled("Write", req, res, next);
};

exports.allowControlHandler = function(req, res, next) {
    allowIfACLEnabled("Control", req, res, next);
};
