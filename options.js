/*jslint node: true*/
"use strict";

var path = require('path');
var regexp = require('node-regexp');
var S = require('string');
var debug = require('./logging').settings;

module.exports = params;

function params(argv) {
  argv = argv || {};
  var opts = {};

  // From input
  opts.cache = argv.cache;
  opts.live = argv.live;
  opts.path = opts.base = argv.base || argv.fileBase || process.cwd();
  opts.port = argv.port;
  opts.secret = argv.secret;
  opts.cert = argv.cert;
  opts.key = argv.key;
  opts.mount = argv.mount || '/';
  opts.verbose = argv.verbose;
  opts.webid = argv.webid;

  // Processed
  opts.leavePatchConnectionOpen = false;
  opts.suffixAcl = argv.suffixAcl || ".acl";
  opts.suffixChanges = argv.suffixChanges || '.changes';
  opts.suffixSSE = argv.suffixSSE || '.events';

  if (!(S(opts.base).endsWith('/'))) {
      opts.base += '/';
  }

  opts.pathFilter = regexp().start(opts.mount).toRegExp();
  opts.xssProxy = argv.xssProxy;
  opts.proxyFilter = regexp().start(opts.xssProxy).toRegExp();

  // TODO this should be an attribute of an object
  opts.usedURIs = {};

  debug("mount: " + opts.mount);
  debug("URI path filter regexp: " + opts.pathFilter);
  debug("Verbose: " + !!opts.verbose);
  debug("WebID: " + !!opts.webid);
  debug("Live: " + !!opts.live);

  return opts;
}

