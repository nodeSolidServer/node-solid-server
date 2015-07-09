/*jslint node: true*/
"use strict";

var path = require('path');
var regexp = require('node-regexp');
var S = require('string');
var logging = require('./logging.js');

module.exports = params;

function params(argv) {
  var opts = {}
  opts.leavePatchConnectionOpen = false;
  opts.aclSuffix = argv.aclSuffix || ",acl";
  opts.uriBase = argv.uriBase ||
      'http://localhost:3000' + process.cwd() + '/test/';
  opts.fileBase = argv.fileBase || process.cwd() + '/test/';
  if (!(S(opts.fileBase).endsWith('/'))) {
      opts.fileBase += '/';
  }
  opts.address = argv.a || '0.0.0.0';
  opts.verbose = argv.v;
  opts.changesSuffix = argv.changesSuffix || ',changes';
  opts.SSESuffix = argv.SSESuffix || ',events';
  opts.ssl = argv.S;
  opts.cors = argv.cors;
  logging.log("   uriBase: " + opts.uriBase);

  opts.pathStart = '/' +
    opts.uriBase
    .split('//')[1]
    .split('/')
    .slice(1)
    .join('/');

  opts.prePathSlash = opts.uriBase
    .split('/')
    .slice(0, 3)
    .join('/');

  logging.log("URI pathStart: " + opts.pathStart);
  opts.pathFilter = regexp().start(opts.pathStart).toRegExp();
  opts.xssProxy = argv.xssProxy;
  opts.proxyFilter = regexp().start(opts.xssProxy).toRegExp();
  opts.live = argv.live;
  opts.webid = argv.webid ? true : false;
  opts.privateKey = argv.privateKey || path.join(opts.fileBase, 'key.pem');
  opts.cert = argv.cert || path.join(opts.fileBase, 'cert.pem');
  
  logging.log("URI path filter regexp: " + opts.pathFilter);
  logging.log("Verbose: " + opts.verbose);
  logging.log("Live: " + opts.live);

  return opts
}
