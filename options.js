/*jslint node: true*/
"use strict";

var path = require('path');
var regexp = require('node-regexp');
var S = require('string');

var logging = require('./logging.js');

exports.aclSuffix = "";
exports.uriBase = "";
exports.fileBase = "";
exports.address = "";
exports.port = 3000;
exports.verbose = false;
exports.changesSuffix = "";
exports.ssl = false;
exports.cors = false;
exports.pathStart = "";
exports.prePathSlash = "";
exports.pathFilter = "";
exports.SSESuffix = "";
exports.xssProxy = "";
exports.leavePatchConnectionOpen = false;
exports.live = false;
exports.privateKey = "";
exports.cert = "";

exports.init = function(argv) {
    this.aclSuffix = argv.aclSuffix || process.env.ACLSUFFIX || ",acl";
    this.uriBase = argv.uriBase || process.env.URIBASE ||
        'http://localhost:3000' + process.cwd() + '/test/';
    this.fileBase = argv.fileBase || process.env.FILEBASE ||
        process.cwd() + '/test/';
    if (!(S(this.fileBase).endsWith('/'))) {
        this.fileBase += '/';
    }
    this.address = argv.a || '0.0.0.0';
    this.port = parseInt(argv.p || process.env.PORT || 3000);
    this.verbose = argv.v;
    this.changesSuffix = argv.changesSuffix || ',changes';
    this.SSESuffix = argv.SSESuffix || ',events';
    this.ssl = argv.S;
    this.cors = argv.cors;
    logging.log("   uriBase: " + this.uriBase);
    this.pathStart = '/' +
        this.uriBase.split('//')[1].split('/').slice(1).join('/');
    this.prePathSlash = this.uriBase.split('/')
        .slice(0, 3).join('/');
    logging.log("URI pathStart: " + this.pathStart);
    this.pathFilter = regexp().start(this.pathStart)
        .toRegExp();
    this.xssProxy = argv.xssProxy;
    this.proxyFilter = regexp().start(this.xssProxy).toRegExp();
    this.live = argv.live;
    this.webid = argv.webid ? true : false;
    this.privateKey = argv.privateKey || path.join(this.fileBase, 'key.pem');
    this.cert = argv.cert || path.join(this.fileBase, 'cert.pem');
    logging.log("URI path filter regexp: " + this.pathFilter);
    logging.log("Verbose: " + this.verbose);
    logging.log("Live: " + this.live);
};
