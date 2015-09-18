module.exports = createServer;

var express = require('express');
var fs = require('fs');
var https = require('https');

var debug = require('./debug');
var createApp = require('./create-app');

function createServer(argv) {
    var app = express();
    var ldpApp = createApp(argv);
    var ldp = ldpApp.locals.ldp;

    // Mount path
    var mount = argv.mount || '/';
    // Removing ending '/'
    if (mount.length > 1 &&
        mount[mount.length - 1] === '/') {
        mount = mount.slice(0, -1);
    }

    app.use(mount, ldpApp);
    debug.settings('mount: ' + mount);

    if (ldp && (ldp.webid || argv.key || argv.cert) ) {
        debug.settings("SSL Private Key path: " + argv.key);
        debug.settings("SSL Certificate path: " + argv.cert);

        if (!argv.cert && !argv.key) {
            throw new Error("Missing SSL cert and SSL key to enable WebID");
        }

        if (!argv.key && argv.cert) {
            throw new Error("Missing path for SSL key");
        }

        if (!argv.cert && argv.key) {
            throw new Error("Missing path for SSL cert");
        }

        var key;
        try {
            key = fs.readFileSync(argv.key);
        } catch(e) {
            throw new Error("Can't find SSL key in " + argv.key);
        }

        var cert;
        try {
            cert = fs.readFileSync(argv.cert);
        } catch(e) {
            throw new Error("Can't find SSL cert in " + argv.cert);
        }

        var credentials = {
            key: key,
            cert: cert,
            requestCert: true
        };

        debug.settings("Certificate: " + credentials.cert);

        return https.createServer(credentials, app);
    }

    return app;
}
