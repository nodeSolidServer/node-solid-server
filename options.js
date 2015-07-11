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
  opts.path = opts.base = argv.base || process.cwd();
  opts.port = argv.port;
  opts.secret = argv.secret;
  opts.cert = argv.cert;
  opts.key = argv.key;
  // TODO no need of uri
  opts.uri = opts.uri = argv.uri;
  opts.verbose = argv.verbose;
  opts.webid = argv.webid;

  // Processed
  opts.leavePatchConnectionOpen = false;
  opts.aclSuffix = argv.aclSuffix || ",acl";

  if (!(S(opts.base).endsWith('/'))) {
      opts.base += '/';
  }
  opts.changesSuffix = argv.changesSuffix || ',changes';
  opts.SSESuffix = argv.SSESuffix || ',events';

  opts.pathStart = '/' +
    opts.uri
    .split('//')[1]
    .split('/')
    .slice(1)
    .join('/');

  opts.prePathSlash = opts.uri
    .split('/')
    .slice(0, 3)
    .join('/');

  opts.pathFilter = regexp().start(opts.pathStart).toRegExp();
  opts.xssProxy = argv.xssProxy;
  opts.proxyFilter = regexp().start(opts.xssProxy).toRegExp();

  // TODO this should be an attribute of an object
  opts.usedURIs = {};

  debug("uri: " + opts.uri);
  debug("pathStart: " + opts.pathStart);
  debug("URI path filter regexp: " + opts.pathFilter);
  debug("Verbose: " + !!opts.verbose);
  debug("WebID: " + !!opts.webid);
  debug("Live: " + !!opts.live);

  return opts
}

