/*jslint node: true*/
"use strict";

var _ = require('underscore');
var webid = require('webid');

var logging = require('./logging.js');
var options = require('./options.js');

module.exports.loginHandler = function(req, res, next) {
    logging.log("Login handler");
    logging.log(options.webid);
    if (!options.webid) {
        next();
        return;
    }
    if (req.session.profile && req.session.identified) {
        logging.log("User: ", req.session.profile);
        next();
        return;
    } else {
        logging.log("Requesting certificate");
        var certificate = req.connection.getPeerCertificate();
        logging.log("certificate requested");
        if (!_.isEmpty(certificate)) {
            var verifAgent = new webid.VerificationAgent(certificate);
            verifAgent.verify(function(result) {
                req.session.profile = result;
                req.session.identified = true;
                logging.log("Identified user:", req.session.profile);
                next();
                return;
            }, function(result) {
                var message;
                switch (result) {
                    case 'certificateProvidedSAN':
                        message = 'No valide Certificate Alternative Name in your certificate';
                        break;
                    case 'profileWellFormed':
                        message = 'Can\'t load your foaf file (RDF may not be valid)';
                        break;
                    case 'falseWebID':
                        message = 'Your certificate public key is not the one of the FOAF file';
                        break;
                    case 'profileAllKeysWellFormed':
                        message = "Missformed WebID";
                        break;
                    default:
                        message = "Unknown WebID error";
                        break;
                }
                res.status(500).send(message);
                return;
            });
        } else {
            return res.sendStatus(403);
        }
    }
};
