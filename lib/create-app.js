module.exports = createApp;

var express = require('express');
var session = require('express-session');
var uuid = require('node-uuid');
var cors = require('cors');
var debug = require('./debug');
var LDP = require('./ldp');
var LdpMiddleware = require('./ldp-middleware');
var proxy = require('./handlers/proxy')
var IdentityProvider = require('./identity-provider');
var vhost = require('vhost');
var path = require('path');
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

    var sessionSettings = {
        secret: ldp.secret || uuid.v1(),
        saveUninitialized: false,
        resave: false
    }

    // Cookies should set to be secure if https is on
    if (ldp.webid || ldp.idp) {
        sessionSettings.cookie = {
            secure: true
        }
    }

    // Session
    app.use(session(sessionSettings));

    // Adding proxy
    if (ldp.proxy) {
        proxy(app, ldp.proxy);
    }

    // Adding Multi-user support
    if (ldp.idp || ldp.signup) {
        var idp = IdentityProvider({
            store: ldp,
            suffixAcl: ldp.suffixAcl,
            overwrite: ldp.signup
        })
        app.use('/accounts', idp.middleware(corsSettings));
        app.use('/', corsSettings, idp.get.bind(idp))
    }

    if (ldp.idp) {
        app.use(vhost('*', LdpMiddleware(corsSettings)));
    }

    if (ldp.signup) {
        app.get('/', function (req, res) {
            res.set('Content-Type', 'text/html');
            var signup = path.resolve(__dirname + '/../static/signup.html')
            res.sendFile(signup);
        });
    }
    app.use('/', LdpMiddleware(corsSettings));

    return app;
}