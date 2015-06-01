/*jslint node: true*/
/*jshint loopfunc:true */
"use strict";

var fs = require('fs');
var path = require('path');
var $rdf = require('rdflib');
var S = require('string');
var _ = require('underscore');

var file = require('./fileStore.js');
var logging = require('./logging.js');
var options = require('./options.js');

var ns = require('./vocab/ns.js');
var rdfVocab = require('./vocab/rdf.js');

var aclExtension = ".acl";

module.exports.allowReadHandler = function(req, res, next) {
    allowIfACLEnabled("Read", req, res, next);
};

module.exports.allowWriteHandler = function(req, res, next) {
    allowIfACLEnabled("Write", req, res, next);
};

module.exports.allowControlHandler = function(req, res, next) {
    allowIfACLEnabled("Control", req, res, next);
};

var allowIfACLEnabled = function(mode, req, res, next) {
    if (!options.webid) {
        next();
    } else {
        allow(mode, req, res, next);
    }
};

var allow = function(mode, req, res, next) {
    var origin = req.get('Origin');
    var accessType = "accessTo";

    var filepath = file.uriToFilename(req.path);
    var relativePath = file.uriToRelativeFilename(req.path);
    var depth = relativePath.split('/');

    for (var i = 0; i < depth.length; i++) {
        var pathACL = filepath + aclExtension;
        var pathURI = file.filenameToBaseUri(filepath);

        if (!fs.existsSync(filepath) || !fs.existsSync(pathACL)) {
            continue;
        }

        logging.log("ACL -- Checking " + accessType + "<" + mode + "> to " +
            pathURI + " for WebID: " + req.session.userId);
        logging.log("ACL -- Looking for policies in " + pathACL);

        var aclData;
        var aclGraph = $rdf.graph();
        try {
            aclData = fs.readFileSync(pathACL);
            $rdf.parse(aclData, aclGraph, pathURI, 'text/turtle');
        } catch (parseErr) {
            //Resetting graph to prevent the code from taking the next if brach.
            aclGraph = $rdf.graph();
        }

        if (aclGraph.statements.length > 0) {
            logging.log("ACL -- Found policies in " + pathACL);
            var controlStatements = aclGraph.any(undefined, ns.acl("mode"),
                ns.acl("Control"));
            _.each(controlStatements, function(controlElem) {
                var accessStatements = aclGraph.any(controlElem.subject,
                    ns.acl(accessType), aclGraph.sym(pathURI));
                _.each(accessStatements, function(accessElem, accessIndex) {
                    var ownerStatements = aclGraph.any(accessElem.subject,
                        ns.acl("owner"), aclGraph.sym(req.session.userId));
                    _.each(ownerStatements, function(ownerElem) {
                        logging.log("ACL -- " + mode + " access allowed (as owner)" +
                            " for: " + req.session.userId);
                        return next();
                    });
                    var agentStatements = aclGraph.any(controlElem.subject,
                        ns.acl("agent"), aclGraph.sym(req.session.userId));
                    _.each(agentStatements, function(agentElem) {
                        logging.log("ACL -- " + mode + " access allowed (as agent)" +
                            " for: " + req.session.userId);
                        return next();
                    });
                    var agentClassStatements = aclGraph.any(controlElem.subject,
                        ns.acl("agentClass"), undefined);
                    _.each(agentClassStatements, function(agentClassElem) {
                        logging.log("ACL -- Found agentClass policy");
                        if (agentClassElem.object.sameTerm(ns.foaf("Agent"))) {
                            logging.log("ACL -- " + mode +
                                " access allowed as FOAF agent");
                            return next();
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
                            _.each(memberStatements, function(memberElem) {
                                logging.log("ACL -- " + req.session.userId +
                                    " listed as member of the group " + groupURI);
                                return next();
                            });
                        }
                    });
                });
            });

            var modeStatements = aclGraph.any(undefined, ns.acl("mode"), ns.acl(mode));
            _.each(modeStatements, function(modeElem) {
                logging.log("ACL -- Found " + accessType + " policy for <" + mode + ">");

                var accessTypeStatements = aclGraph.any(modeElem.subject, ns.acl(accessType),
                    aclGraph.sym(pathURI));
                _.each(accessTypeStatements, function(accessTypeElem) {
                    var origins = aclGraph.any(modeElem.subject, ns.acl("origin"), undefined);
                    if (origin.length > 0 && origins.length > 0) {
                        logging.log("ACL -- Origin set to: " + rdfVocab.brack(origin));
                        _.each(origins, function(originsElem) {
                            if (rdfVocab.brack(origin) === originsElem.object.toString()) {
                                logging.log("ACL -- Found policy for origin: " +
                                    originsElem.object.toString());
                                return allowOrigin(mode, req, res, next, aclGraph, accessTypeElem);
                            }
                        });
                    } else {
                        logging.log("ACL -- No origin found, moving on.");
                    }
                    return allowOrigin(mode, req, res, next, aclGraph, accessTypeElem);
                });
            });

            if (req.session.userId.length === 0 || req.session.identified === false)  {
                logging.log("ACL -- Authentication required");
                return res.sendStatus(401);
            }
            logging.log("ACL -- " + mode + " access denied for: " + req.session.userId);
            return res.sendStatus(403);
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
    return next();
};

var allowOrigin = function(mode, req, res, next, aclGraph, triple) {
    logging.log("ACL -- In allow origin");
    var ownerStatements = aclGraph.any(triple.subject, ns.acl("owner"),
        aclGraph.sym(req.session.userId));
    _.each(ownerStatements, function(ownerElem) {
        logging.log("ACL -- " + mode + " access allowed (as owner) for: " + req.session.userId);
        return next();
    });
    var agentStatements = aclGraph.any(triple.subject, ns.acl("agent"),
        aclGraph.sym(req.session.userId));
    _.each(agentStatements, function(agentElem) {
        logging.log("ACL -- " + mode + " access allowed (as agent) for: " + req.session.userId);
        return next();
    });
    var agentClassStatements = aclGraph.any(triple.subject, ns.acl("agentClass"), undefined);
    _.each(agentClassStatements, function(agentClassElem) {
        //Check for FOAF groups
        logging.log("ACL -- Found agentClass policy");
        if (agentClassElem.object.sameTerm(ns.foaf("Agent"))) {
            logging.log("ACL -- " + mode + " allowed access as FOAF agent");
            return next();
        }
        var groupURI = rdfVocab.debrack(agentClassElem.object.toString());
        var groupGraph = $rdf.graph();
        var groupFetcher = $rdf.fetcher(groupGraph, 3000, false);
        groupFetcher.nowOrWhenFetched(groupURI, null, function(ok, err) {});
        var typeStatements = groupGraph.any(agentClassElem.object, ns.rdf("type"), ns.foaf("Group"));
        if (groupGraph.statements.length > 0 && typeStatements.length > 0) {
            var memberStatements = groupGraph.any(agentClassElem.object, ns.foaf("member"),
                groupGraph.sym(req.session.userId));
            _.each(memberStatements, function(memberElem) {
                logging.log("ACL -- " + req.session.userId + " listed as member of the group " + groupURI);
                return next();
            });
        }
    });
};
