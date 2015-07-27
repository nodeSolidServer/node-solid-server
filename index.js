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
var uuid = require('node-uuid');
var cors = require('cors');

// ldnode dependencies
var acl = require('./lib/acl');
var metadata = require('./lib/metadata');
var header = require('./lib/header');
var LDP = require('./lib/ldp');
var login = require('./lib/login');
var parse = require('./lib/parse');
var debug = require('./lib/logging');

// Request handlers
var getHandler = require('./lib/handlers/get.js');
var postHandler = require('./lib/handlers/post.js');
var putHandler = require('./lib/handlers/put.js');
var deleteHandler = require('./lib/handlers/delete.js');
var patchHandler = require('./lib/handlers/patch.js');

function ldnode (argv) {
    var ldp = new LDP(argv);
    var app = express();

    // Setting options as local variable
    app.locals.ldp = ldp;

    // Session
    app.use(session({
        secret: ldp.secret || uuid.v1(),
        saveUninitialized: false,
        resave: false
    }));

    // Setting up routes
    app.use('/', routes());

    // Adding proxy
    if (ldp.xssProxy) {
        proxy(app, ldp.proxyFilter);
    }

    // Setup Express app
    if (ldp.live) {
        ws(app);
    }

    debug.server("Router attached to " + ldp.mount);

    return app;
}

function createServer(argv) {
    var app = express();
    var ldpApp = ldnode(argv);
    var ldp = ldpApp.locals.ldp;
    app.use(ldp.mount, ldpApp);

    if (ldp && (ldp.webid || ldp.key || ldp.cert) ) {
        debug.settings("SSL Private Key path: " + ldp.key);
        debug.settings("SSL Certificate path: " + ldp.cert);

        if (!ldp.cert && !ldp.key) {
            throw new Error("Missing SSL cert and SSL key to enable WebID");
        }

        if (!ldp.key && ldp.cert) {
            throw new Error("Missing path for SSL key");
        }

        if (!ldp.cert && ldp.key) {
            throw new Error("Missing path for SSL cert");
        }

        var key;
        try {
            key = fs.readFileSync(ldp.key);
        } catch(e) {
            throw new Error("Can't find SSL key in " + ldp.key);
        }

        var cert;
        try {
            cert = fs.readFileSync(ldp.cert);
        } catch(e) {
            throw new Error("Can't find SSL cert in " + ldp.cert);
        }

        var credentials = {
                key: key,
                cert: cert,
                requestCert: true
            };

        debug.settings("Private Key: " + credentials.key);
        debug.settings("Certificate: " + credentials.cert);

        return https.createServer(credentials, app);
    }

    return app;
}

function proxy (app, path) {
    debug.settings('XSS Proxy listening to ' + path);
    app.get(path, function (req, res) {
        debug.settings('originalUrl: ' + req.originalUrl);
        var uri = req.query.uri;
        if (!uri) {
            return res
                .status(400)
                .send("Proxy has no uri param ");
        }

        debug.settings('Proxy destination URI: ' + uri);
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
    router.use(header.linksHandler);

    // Add response time
    router.use(responseTime());

    // Setting CORS
    router.use(cors({
        methods: [
            'OPTIONS', 'HEAD', 'GET',
            'PATCH', 'POST', 'PUT', 'DELETE'
        ],
        exposedHeaders: 'User, Location, Link, Vary, Last-Modified, Content-Length',
        credentials: true,
        maxAge: 1728000,
        origin: true
    }));

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
        debug.subscription("incoming on " + socket.path);
        socket.on('message', function(msg) {
            debug.subscription("message = " + msg);
            // subscribeToChanges(socket, res);
        });
    });
}

ldnode.proxy = proxy;
ldnode.ws = ws;
ldnode.routes = routes;
ldnode.createServer = createServer;

module.exports = ldnode;

