exports.loginHandler = loginHandler;

var webid = require('webid')('tls');
var debug = require('./debug').login;
var HttpError = require('./http-error');

function loginHandler(req, res, next) {
    var ldp = req.app.locals.ldp;

    // No webid required? skip
    if (!ldp.webid) {
        setEmptySession(req);
        return next();
    }

    // User already logged in? skip
    if (req.session.userId && req.session.identified) {
        debug("User: " + req.session.userId);
        res.set('User', req.session.userId);
        return next();
    }

    var certificate = req.connection.getPeerCertificate();
    // Certificate is empty? skip
    if (certificate === null || Object.keys(certificate).length === 0)  {
        debug("No client certificate found in the request. Did the user click on a cert?");
        setEmptySession(req);
        return next();
    }

    // Verify webid
    webid.verify(function(err, result) {
        if (err) {
            debug("Error processing certificate: " + err);
            setEmptySession(req);
            return next(new HttpError({
                status: 403,
                message: err.message
            }));
        }
        req.session.userId = result;
        req.session.identified = true;
        debug("Identified user: " + req.session.userId);
        res.set('User', req.session.userId);
        return next();
    });
}

function setEmptySession(req) {
    req.session.userId = "";
    req.session.identified = false;
}
