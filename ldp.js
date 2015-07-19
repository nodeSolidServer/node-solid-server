/*jslint node: true*/
"use strict";

var path = require('path');
var regexp = require('node-regexp');
var S = require('string');
var fs = require('fs');
var $rdf = require('rdflib');
var async = require('async');
var fs = require('fs');
var mkdirp = require('fs-extra').mkdirp;

var debug = require('./logging').settings;
var utils = require('./fileStore.js');
var ns = require('./vocab/ns.js').ns;
var metaExtension = '.meta';
var turtleExtension = '.ttl';

module.exports = LDP;

function LDP(argv) {
  argv = argv || {};
  var ldp = this;

  // From input
  ldp.cache = argv.cache;
  ldp.live = argv.live;
  ldp.root = argv.root || process.cwd();
  ldp.port = argv.port;
  ldp.secret = argv.secret;
  ldp.cert = argv.cert;
  ldp.key = argv.key;
  ldp.mount = argv.mount || '/';
  // Removing ending '/'
  if (ldp.mount.length > 1 &&
    ldp.mount[ldp.mount.length - 1] === '/') {
    ldp.mount = ldp.mount.slice(0, -1);
  }

  ldp.verbose = argv.verbose;
  ldp.webid = argv.webid;

  // Processed
  ldp.leavePatchConnectionOpen = false;
  ldp.suffixAcl = argv.suffixAcl || ".acl";
  ldp.suffixChanges = argv.suffixChanges || '.changes';
  ldp.suffixSSE = argv.suffixSSE || '.events';

  if (!(S(ldp.root).endsWith('/'))) {
      ldp.root += '/';
  }

  ldp.pathFilter = regexp().start(ldp.mount).toRegExp();
  ldp.xssProxy = argv.xssProxy;
  ldp.proxyFilter = regexp().start(ldp.xssProxy).toRegExp();

  // TODO this should be an attribute of an object
  ldp.usedURIs = {};

  debug("mount: " + ldp.mount);
  debug("root: " + ldp.root);
  debug("URI path filter regexp: " + ldp.pathFilter);
  debug("Verbose: " + !!ldp.verbose);
  debug("WebID: " + !!ldp.webid);
  debug("Live: " + !!ldp.live);

  return ldp;
}

LDP.prototype.stat = fs.stat;

LDP.prototype.readFile = function (filename, callback) {
  fs.readFile(filename, {
      'encoding': 'utf8'
  }, function(err, data) {
    if (err) {
      return callback({
        status: 404,
        message: "Can't read file: " + err
      });
    }

    return callback(null, data);
  });
};

LDP.prototype.readContainerMeta = function (directory, callback) {
  fs.readFile(directory + metaExtension, {
    'encoding': 'utf8'
  }, function(err, data) {
    if (err) {
      data = "";
    }
    return callback(null, data);
  });
};

LDP.prototype.listContainer = function (filename, uri, containerData, callback) {
  var ldp = this;
  var baseUri = utils.filenameToBaseUri(filename, uri, ldp.root);
  var resourceGraph = $rdf.graph();
  try {
    $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
  } catch (err) {
    debug("GET/HEAD -- Error parsing data: " + err);
    return callback({status:500, message: err});
  }

  async.waterfall([
    // Adding current folder stats
    function(next) {
      ldp.stat(filename, function(err,  containerStats) {
        if (!err) {
          resourceGraph.add(
            resourceGraph.sym(baseUri),
            ns.stat('mtime'),
            containerStats.mtime.getTime());

          resourceGraph.add(
            resourceGraph.sym(baseUri),
            ns.stat('size'),
            containerStats.size);
        }
        return next(null, filename);
      });
    },
    // reading directory
    function (filename, next) {
      debug("GET/HEAD -- Reading directory");
      fs.readdir(filename, function (err, files) {
        if (err) {
          debug("GET/HEAD -- Error reading files: " + err);
          return next({status:404, message:err});
        }

        debug("Files in directory: " + files);
        return next(null, files);
      });
    },
    // Iterate through all the files
    function (files, next) {

      async.each(files, function(file, cb) {
        if (S(file).endsWith(metaExtension) || S(file).endsWith(ldp.suffixAcl)) {
          return cb(null);
        }
          
        fs.stat(filename + file, function (err, stats) {

          if (err) {
            debug("Error getting container: " + err);
            return cb(null);
          }

          resourceGraph.add(
            resourceGraph.sym(baseUri),
            ns.ldp('contains'),
            resourceGraph.sym(file));

          var metaFile;
          var fileBaseUri;
          var fileSubject = file;

          if (stats.isDirectory()) {
              metaFile = filename + file + '/' + metaExtension;
              fileSubject += '/';
          } else if (stats.isFile() && S(file).endsWith(turtleExtension)) {
              metaFile = filename + file;
          } else {
              metaFile = filename + file + metaExtension;
          }
          fileBaseUri = utils.filenameToBaseUri(file, uri, ldp.root);

          var metadataGraph = $rdf.graph();

          fs.stat(metaFile, function (err, metaStats) {
            
            if (err || (metaStats && metaStats.isDirectory())) {}

            fs.readFile(metaFile, {encoding: 'utf8'}, function(err, rawMetadata) {
              try {
                $rdf.parse(
                  rawMetadata,
                  metadataGraph,
                  fileBaseUri,
                  'text/turtle');
              } catch (dirErr) {
                  metadataGraph = $rdf.graph();
              }

              var typeStatements = metadataGraph
                .statementsMatching(
                  metadataGraph.sym(fileBaseUri),
                  ns.rdf('type'),
                  undefined)
                .forEach(function (typeStatement) {
                  resourceGraph.add(
                    resourceGraph.sym(fileSubject),
                    typeStatement.predicate,
                    typeStatement.object);
                });

              fs.stat(filename + file, function(err, fileStats) {
                if (err) {}

                resourceGraph.add(
                  metadataGraph.sym(fileSubject),
                  ns.stat('mtime'),
                  fileStats.mtime.getTime());

                resourceGraph.add(
                  metadataGraph.sym(fileSubject),
                  ns.stat('size'),
                  fileStats.size);
                return cb(null);
              });
            });
          });
        });
      }, next);

    }
  ],
  function (err, data) {
    try {
      var turtleData = $rdf.serialize(
        undefined,
        resourceGraph,
        null,
        'text/turtle');

      // TODO dont forget to parseLinkedData
      return callback(null, turtleData);
    } catch (parseErr) {
      debug("GET/HEAD -- Error serializing container: " + parseErr);
      return callback({status:500, message: parseErr});
    }
  });
};

LDP.prototype.writeFile = function (filePath, contents, cb) {
    mkdirp(path.dirname(filePath), function (err) {
        if (err) {
            debug("PUT -- Error creating directory: " + err);
            return cb(err);
        }
        fs.writeFile(filePath, contents, cb);
  });
};
