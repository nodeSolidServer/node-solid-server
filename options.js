/*jslint node: true*/
"use strict";

var logging = require('./logging.js');
var regexp = require('node-regexp');

module.exports.aclSuffix = "";
module.exports.uriBase = "";
module.exports.fileBase = "";
module.exports.address = "";
module.exports.port = 3000;
module.exports.verbose = false;
module.exports.changesSuffix = "";
module.exports.ssl = false;
module.exports.cors = false;
module.exports.pathStart = "";
module.exports.prePathSlash = "";
module.exports.pathFilter = "";
module.exports.SSESuffix = "";
module.exports.xssProxy = "";
module.exports.leavePatchConnectionOpen = false;
module.exports.live = false;

module.exports.init = function(argv) {
    this.aclSuffix = argv.aclSuffix || process.env.ACLSUFFIX || ",acl";
    this.uriBase = argv.uriBase || process.env.URIBASE ||
        'http://localhost:3000' + process.cwd() + '/test/';
    this.fileBase = argv.fileBase || process.env.FILEBASE ||
        process.cwd() + '/test/';
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
    logging.log("URI path filter regexp: " + this.pathFilter);
    logging.log("Verbose: " + this.verbose);
    logging.log("Live: " + this.live);
};
