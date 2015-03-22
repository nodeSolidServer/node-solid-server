/*jslint node: true*/
"use strict";

var _ = require('underscore');
var webid = require('webid');

var logging = require('./logging.js');
var options = require('./options.js');

module.exports.loginHandler = function(req, res, next) {
    if (!options.webid) {
        return next();
    }
    if (req.session.profile && req.session.identified) {
        logging.log("Login -- User: " + req.session.profile);
        return next();
    } else {
        var certificate = req.connection.getPeerCertificate();
        if (!_.isEmpty(certificate)) {
            var verifAgent = new webid.VerificationAgent(certificate);
            verifAgent.verify(function(result) {
                req.session.profile = result;
                req.session.identified = true;
                logging.log("Login -- Identified user: " + req.session.profile);
                return next();
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
                logging.log("Login -- Error processing certificate: " + message);
                return res.status(403).send(message);
            });
        } else {
            logging.log("Login -- Empty certificate");
            return res.sendStatus(403);
        }
    }
};
