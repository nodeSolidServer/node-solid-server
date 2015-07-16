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
  opts.root = argv.root || process.cwd();
  opts.port = argv.port;
  opts.secret = argv.secret;
  opts.cert = argv.cert;
  opts.key = argv.key;
  opts.mount = argv.mount || '/';
  // Removing ending '/'
  if (opts.mount.length > 1 &&
    opts.mount[opts.mount.length - 1] === '/') {
    opts.mount = opts.mount.slice(0, -1);
  }

  opts.verbose = argv.verbose;
  opts.webid = argv.webid;

  // Processed
  opts.leavePatchConnectionOpen = false;
  opts.suffixAcl = argv.suffixAcl || ".acl";
  opts.suffixChanges = argv.suffixChanges || '.changes';
  opts.suffixSSE = argv.suffixSSE || '.events';

  if (!(S(opts.root).endsWith('/'))) {
      opts.root += '/';
  }

  opts.pathFilter = regexp().start(opts.mount).toRegExp();
  opts.xssProxy = argv.xssProxy;
  opts.proxyFilter = regexp().start(opts.xssProxy).toRegExp();

  // TODO this should be an attribute of an object
  opts.usedURIs = {};

  debug("mount: " + opts.mount);
  debug("root: " + opts.root);
  debug("URI path filter regexp: " + opts.pathFilter);
  debug("Verbose: " + !!opts.verbose);
  debug("WebID: " + !!opts.webid);
  debug("Live: " + !!opts.live);

  return opts;
}

