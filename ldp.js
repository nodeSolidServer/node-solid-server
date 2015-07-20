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
var uuid = require('node-uuid');

var debug = require('./logging');

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

  debug.settings("mount: " + ldp.mount);
  debug.settings("root: " + ldp.root);
  debug.settings("URI path filter regexp: " + ldp.pathFilter);
  debug.settings("Verbose: " + !!ldp.verbose);
  debug.settings("WebID: " + !!ldp.webid);
  debug.settings("Live: " + !!ldp.live);

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
    debug.handlers("GET/HEAD -- Error parsing data: " + err);
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
      debug.handlers("GET/HEAD -- Reading directory");
      fs.readdir(filename, function (err, files) {
        if (err) {
          debug.handlers("GET/HEAD -- Error reading files: " + err);
          return next({status:404, message:err});
        }

        debug.handlers("Files in directory: " + files);
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
            debug.handlers("Error getting container: " + err);
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
      debug.handlers("GET/HEAD -- Error serializing container: " + parseErr);
      return callback({status: 500, message: parseErr});
    }
  });
};

LDP.prototype.writeFile = function (filePath, contents, cb) {
    mkdirp(path.dirname(filePath), function (err) {
        if (err) {
            debug.handlers("PUT -- Error creating directory: " + err);
            return cb(err);
        }
        return fs.writeFile(filePath, contents, cb);
  });
};

LDP.prototype.delete = function(filename, callback) {
    var ldp = this;
    ldp.stat(filename, function(err, stats) {
        if (err) {
            return callback({status:404, message: "Can't find file: " + err});
        }

        if (stats.isDirectory()) {
            return ldp.deleteContainerMetadata(filename, callback);
        } else {
            return ldp.deleteResource(filename, callback);
        }
    });
};

LDP.prototype.deleteContainerMetadata = function(directory, callback) {
    return fs.unlink(directory + metaExtension, function(err, data) {
        if (err) {
            debug.container("DELETE -- unlink() error: " + err);
            return callback({status:404, message: "Can't delete container: " + err });
        }
        return callback(null, data);
    });
};

LDP.prototype.deleteResource = function(filename, callback) {
    return fs.unlink(filename, function(err, data) {
        if (err) {
            debug.container("DELETE -- unlink() error: " + err);
            return callback({status:404, message: "Can't delete container: " + err });
        }
        return callback(null, data);
    });
};


var addUriTriple = function(kb, s, o, p) {
    kb.add(kb.sym(s), kb.sym(o), kb.sym(p));
};

LDP.prototype.createResourceUri = function(containerURI, slug, isBasicContainer) {
    var ldp = this;

    var newPath;
    if (slug) {
        if (S(slug).endsWith(turtleExtension)) {
            newPath = path.join(containerURI, slug);
        } else {
            if (isBasicContainer) {
                newPath = path.join(containerURI, slug);
            } else {
                newPath = path.join(containerURI, slug + turtleExtension);
            }
        }
    } else {
        if (isBasicContainer) {
            newPath = path.join(containerURI, uuid.v1());
        } else {
            newPath = path.join(containerURI, uuid.v1() + turtleExtension);
        }
    }
    if (!(fs.existsSync(newPath) || containerURI in ldp.usedURIs)) {
        ldp.usedURIs[newPath] = true;
    } else {
        return null;
    }
    return newPath;
};

LDP.prototype.releaseResourceUri = function (uri) {
    delete this.usedURIs[uri];
};

LDP.prototype.createNewResource = function(fileBase, uri, resourcePath, resourceGraph, callback) {
    var ldp = this;
    var resourceURI = path.relative(fileBase, resourcePath);
    //TODO write files with relative URIS.
    var rawResource = $rdf.serialize(
        undefined,
        resourceGraph,
        uri + resourceURI,
        'text/turtle');

    debug.container("Writing new resource to " + resourcePath);
    debug.container("Resource:\n" + rawResource);

    fs.writeFile(
        resourcePath,
        rawResource,
        writeResourceCallback);

    function writeResourceCallback(err) {
        if (err) {
            debug.container("Error writing resource: " + err);
            ldp.releaseResourceUri(resourcePath);
            return callback(err);
        }

        return callback(err);
    }
};

LDP.prototype.createNewContainer = function (uri, containerPath, containerGraph, callback) {
    var ldp = this;
    fs.mkdir(containerPath, mkdirCallback);

    function mkdirCallback(err) {
        if (err) {
            debug.container("Error creating directory for new container: " + err);
            ldp.releaseResourceUri(containerPath);
            return callback(err);
        }

        var rawContainer = $rdf.serialize(
            undefined,
            containerGraph,
            uri,
            'text/turtle');

        debug.container("rawContainer " + rawContainer);

        ldp.writeContainerMetadata(
            containerPath,
            rawContainer,
            writeContainerCallback);
    }

    function writeContainerCallback(err) {
        if (err) {
            debug.container("Error writing container: " + err);
            ldp.releaseResourceUri(containerPath);
            return callback(err);
        }

        debug.container("Wrote container to " + containerPath);
        ldp.releaseResourceUri(containerPath);
        return callback(err);

    }
};

LDP.prototype.writeContainerMetadata = function (directory, container, callback) {
    fs.writeFile(directory + metaExtension, container, callback);
};


LDP.prototype.isMetadataFile = function (filename) {
    if (path.extname(filename) === metaExtension)
        return true;
    return false;
};

LDP.prototype.hasContainerMetadata = function(directory) {
    return fs.existsSync(directory + metaExtension);
};
