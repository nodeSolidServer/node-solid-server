/*jslint node: true*/
"use strict";

var webid = require('webid');

var logging = require('./logging.js');
var options = require('./options.js');

function loginHandler(req, res, next) {
    if (!options.webid) {
        setEmptySession(req);
        return next();
    }
    if (req.session.profile && req.session.identified) {
        logging.log("Login -- User: " + req.session.profile);
        return next();
    } else {
        var certificate = req.connection.getPeerCertificate();
        if (!(certificate === null || Object.keys(certificate).length === 0))  {
            var verifAgent = new webid.VerificationAgent(certificate);
            verifAgent.verify(function(err, result) {
                if (err) {
                    var message;
                    switch (err) {
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
                    setEmptySession(req);
                    return res.status(403).send(message);
                } else {
                    req.session.userId = result;
                    req.session.identified = true;
                    logging.log("Login -- Identified user: " + req.session.userId);
                    return next();
                }
            });
        } else {
            logging.log("Login -- Empty certificate");
            setEmptySession(req);
            next();
        }
    }

    function setEmptySession(req) {
        req.session.userId = "";
        req.session.identified = false;
    }
}

exports.loginHandler = loginHandler;
