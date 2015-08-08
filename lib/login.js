/*jslint node: true*/
"use strict";

var webid = require('webid');
var debug = require('./logging').login;

function loginHandler(req, res, next) {
    var ldp = req.app.locals.ldp;
    if (!ldp.webid) {
        setEmptySession(req);
        return next();
    }
    if (req.session.userId && req.session.identified) {
        debug("User: " + req.session.userId);
        res.set('User', req.session.userId);
        return next();
    } else {
        var certificate = req.connection.getPeerCertificate();
        if (!(certificate === null || Object.keys(certificate).length === 0))  {
            var verifAgent = new webid.VerificationAgent(certificate);
            verifAgent.verify(function(err, result) {
                if (err) {
                    debug("Error processing certificate: " + err);
                    setEmptySession(req);
                    var authError = new Error();
                    authError.status = 403;
                    authError.message = err;
                    return next(authError);
                } else {
                    req.session.userId = result;
                    req.session.identified = true;
                    debug("Identified user: " + req.session.userId);
                    res.set('User', req.session.userId);
                    return next();
                }
            });
        } else {
            debug("No client certificate found in the request. Did the user click on a cert?");
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
