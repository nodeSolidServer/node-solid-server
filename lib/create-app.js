module.exports = createApp;

var express = require('express');
var session = require('express-session');
var uuid = require('node-uuid');
var cors = require('cors');
var debug = require('./debug');
var LDP = require('./ldp');
var LdpMiddleware = require('./ldp-middleware');
var proxy = require('./handlers/proxy')
var corsSettings = cors({
    methods: [
        'OPTIONS', 'HEAD', 'GET',
        'PATCH', 'POST', 'PUT', 'DELETE'
    ],
    exposedHeaders: 'User, Location, Link, Vary, Last-Modified, Content-Length',
    credentials: true,
    maxAge: 1728000,
    origin: true
});

function createApp (argv) {
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

    // Adding proxy
    if (ldp.proxy) {
        proxy(app, ldp.proxy);
    }

    // Setting up routes
    app.use('/', LdpMiddleware(corsSettings));

    return app;
}
