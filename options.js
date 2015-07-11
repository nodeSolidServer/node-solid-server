/*jslint node: true*/
"use strict";

var path = require('path');
var regexp = require('node-regexp');
var S = require('string');
var debug = require('./logging').settings;

module.exports = params;

function params(argv) {
  var opts = {};

  // From input
  opts.cache = argv.cache;
  opts.live = argv.live;
  opts.path = opts.fileBase = argv.fileBase || process.cwd();
  opts.port = argv.port;
  opts.secret = argv.secret;
  opts.ssl = argv.ssl;
  // TODO no need of uriBase
  opts.uri = opts.uriBase = argv.uriBase;
  opts.verbose = argv.verbose;
  opts.webid = argv.webid;

  // Processed
  opts.leavePatchConnectionOpen = false;
  opts.aclSuffix = argv.aclSuffix || ",acl";

  if (!(S(opts.fileBase).endsWith('/'))) {
      opts.fileBase += '/';
  }
  opts.changesSuffix = argv.changesSuffix || ',changes';
  opts.SSESuffix = argv.SSESuffix || ',events';

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

  opts.pathFilter = regexp().start(opts.pathStart).toRegExp();
  opts.xssProxy = argv.xssProxy;
  opts.proxyFilter = regexp().start(opts.xssProxy).toRegExp();

  // TODO this should be an attribute of an object
  opts.usedURIs = {};

  debug("uriBase: " + opts.uriBase);
  debug("pathStart: " + opts.pathStart);
  debug("URI path filter regexp: " + opts.pathFilter);
  debug("Verbose: " + !!opts.verbose);
  debug("Live: " + !!opts.live);

  return opts
}
