/*jslint node: true*/
"use strict";

// Third-party dependencies
var express = require('express');
var app = express();
var getRawBody = require('raw-body');
var expressWs = require('express-ws');
var fs = require('fs');
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var session = require('express-session');
var http = require('http');
var https = require('https');
var request = require('request');
var debug = require('./logging').settings;
var debugSubscription = require('./logging').subscription;
var debugServer = require('./logging').server;

// ldnode dependencies
var acl = require('./acl.js');
var metadata = require('./metadata.js');
var options = require('./options.js');
var login = require('./login.js');
var container = require('./container.js');
var parse = require('./parse.js');

// Request handlers
var getHandler = require('./handlers/get.js');
var postHandler = require('./handlers/post.js');
var putHandler = require('./handlers/put.js');
var deleteHandler = require('./handlers/delete.js');
var patchHandler = require('./handlers/patch.js');


function ldnode (argv) {
    var opts = options(argv);
    var app = express();

    // Setting options as local variable
    app.locals.ldp = opts;

    // Session [TODO]
    app.use(session({
        secret: opts.secret || 'node-ldp',
        saveUninitialized: false,
        resave: false
    }));

    // Setting up routes
    app.use('/', routes());

    // Adding proxy
    if (opts.xssProxy) {
      console.log(opts.proxyFilter);
        proxy(app, opts.proxyFilter);
    }

    // Setup Express app
    if (opts.live) {
        ws(app);
    }

    debugServer("Router attached to " + opts.mount);

    return app;
}

function createServer(argv) {
    var app = express();
    var ldp = ldnode(argv);
    var opts = ldp.locals.ldp;
    app.use(opts.mount, ldp);

    if (opts && (opts.webid || opts.key || opts.cert) ) {
        debug("SSL Private Key path: " + opts.key);
        debug("SSL Certificate path: " + opts.cert);

        if (!opts.cert && !opts.key) {
            throw new Error("Missing SSL cert and SSL key to enable WebID");
        }

        if (!opts.key && opts.cert) {
            throw new Error("Missing path for SSL key");
        }

        if (!opts.cert && opts.key) {
            throw new Error("Missing path for SSL cert");
        }

        var key;
        try {
            key = fs.readFileSync(opts.key);
        } catch(e) {
            throw new Error("Can't find SSL key in " + opts.key);
        }

        var cert;
        try {
            cert = fs.readFileSync(opts.cert);
        } catch(e) {
            throw new Error("Can't find SSL cert in " + opts.cert);
        }

        var credentials = {
                key: key,
                cert: cert,
                requestCert: true
            };

        debug("Private Key: " + credentials.key);
        debug("Certificate: " + credentials.cert);

        return https.createServer(credentials, app);
    }

    return app;
}

function proxy (app, path) {
    debug('XSS Proxy listening to ' + path);
    app.get(path, function (req, res) {
        debug('originalUrl: ' + req.originalUrl);
        var uri = req.query.uri;
        if (!uri) {
            return res
                .status(400)
                .send("Proxy has no uri param ");
        }

        debug('Proxy destination URI: ' + uri);
        request.get(uri).pipe(res);
    });
}

function routes () {
    var router = express.Router('/');
    router.use('/*', function(req, res, next) {
        getRawBody(req,
                   {
                       length: req.headers['content-length'],
                       limit: '1mb',
                       encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
                   },
                   function(err, string) {
                       if (err) {
                           return next(err);
                       }
                       req.text = string;
                       next();
                   });
    });

    router.use('/*', login.loginHandler);

    //ACL handlers
    router.get("/*", acl.allowReadHandler);
    router.head("/*", acl.allowReadHandler);
    router.post("/*", acl.allowAppendThenWriteHandler);
    router.patch("/*", acl.allowAppendThenWriteHandler);
    router.put("/*", acl.allowAppendThenWriteHandler);
    router.delete("/*", acl.allowWriteHandler);

    // Convert json-ld and nquads to turtle
    router.use('/*', parse.parseHandler);
    // Add links headers
    router.use(metadata.linksHandler);
    // Add response time
    router.use(responseTime());

    // HTTP methods handlers
    router.get('/*', getHandler.handler);
    router.head('/*', getHandler.headHandler);
    router.put('/*', putHandler.handler);
    router.delete('/*', deleteHandler.handler);
    router.post('/*', postHandler.handler);
    router.patch('/*', patchHandler.handler);
    return router;
}

function ws (app) {
    expressWs(app);
    app.mountpath = ''; //  needs to be set for addSocketRoute aka .ws()
    // was options.pathFilter
    app.ws('/', function(socket, res) {
        debugSubscription("incoming on " + socket.path);
        socket.on('message', function(msg) {
            debugSubscription("message = " + msg);
            // subscribeToChanges(socket, res);
        });
    });
}

ldnode.proxy = proxy;
ldnode.ws = ws;
ldnode.routes = routes;
ldnode.createServer = createServer;

module.exports = ldnode;

