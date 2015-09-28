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

var debug = require('./debug');

var utils = require('./utils.js');
var ns = require('./vocab/ns.js').ns;
var HttpError = require('./http-error');
var turtleExtension = '.ttl'

module.exports = LDP;

function LDP(argv) {
  argv = argv || {};
  var ldp = this;

  // From input
  ldp.cache = argv.cache;
  ldp.live = argv.live;
  ldp.root = argv.root || process.cwd();
  // Add trailing /
  if (!(S(ldp.root).endsWith('/'))) {
    ldp.root += '/';
  }
  ldp.port = argv.port;
  ldp.secret = argv.secret;
  ldp.cert = argv.cert;

  ldp.verbose = argv.verbose;
  ldp.webid = argv.webid;

  // Processed
  ldp.leavePatchConnectionOpen = false;
  ldp.suffixAcl = argv.suffixAcl || ".acl";
  ldp.suffixMeta = argv.suffixMeta || ".meta";
  ldp.suffixChanges = argv.suffixChanges || '.changes';
  ldp.suffixSSE = argv.suffixSSE || '.events';
  ldp.turtleExtensions = ['.ttl', ldp.suffixAcl, ldp.suffixMeta, ldp.suffixChanges, ldp.suffixSSE]

  ldp.proxy = argv.proxy;

  // Cache of usedURIs
  ldp.usedURIs = {};

  // Error pages folder
  ldp.noErrorPages = argv.noErrorPages;
  if (!ldp.noErrorPages) {
    ldp.errorPages = argv.errorPages;
    if (!ldp.errorPages) {
        // For now disable error pages if errorPages parameter is not explicitly passed
        ldp.noErrorPages = true;
    } else if (!S(ldp.errorPages).endsWith('/')) {
      ldp.errorPages += '/';
    }
  }
  ldp.errorHandler = argv.errorHandler;

  // argv.skin is false when --no-skin is passed
  if (argv.skin !== false) {
    ldp.skin = argv.skin || 'https://linkeddata.github.io/warp/#/list/';
  }

  debug.settings("root: " + ldp.root);
  debug.settings("URI path filter regexp: " + ldp.pathFilter);
  debug.settings("Verbose: " + !!ldp.verbose);
  debug.settings("WebID: " + !!ldp.webid);
  debug.settings("Live: " + !!ldp.live);

  return ldp;
}

LDP.prototype.stat = function(file, callback) {
  fs.stat(file, function(err, stats) {
    if (err) {
        return callback(new HttpError({
          status: err.code === 'ENOENT' ? 404 : 500,
          message: err.message
        }));
      }
    return callback(null, stats);
  });
};

LDP.prototype.readFile = function (filename, callback) {
  fs.readFile(filename, {
      'encoding': 'utf8'
  }, function(err, data) {
    if (err) {
      return callback(new HttpError({
        status: err.code === 'ENOENT' ? 404 : 500,
        message: "Can't read file: " + err
      }));
    }

    return callback(null, data);
  });
};

LDP.prototype.readContainerMeta = function (directory, callback) {
  var ldp = this;

  if (directory[directory.length-1] !== '/') {
    directory += '/';
  }

  ldp.readFile(directory + ldp.suffixMeta, function(err, data) {
    if (err) {
      return callback(new HttpError({
        status: err.status,
        message: 'Can\'t read metafile'
      }));
    }
    return callback(null, data);
  });
};

LDP.prototype.listContainer = function (filename, uri, containerData, callback) {
  function addStats (resourceGraph, baseUri, stats) {
    resourceGraph.add(
      resourceGraph.sym(baseUri),
      ns.stat('mtime'),
      stats.mtime.getTime() / 1000);

    resourceGraph.add(
      resourceGraph.sym(baseUri),
      ns.stat('size'),
      stats.size);
  }

  function readdir(filename, callback) {
    debug.handlers("GET/HEAD -- Reading directory");
    fs.readdir(filename, function (err, files) {
      if (err) {
        debug.handlers("GET/HEAD -- Error reading files: " + err);
        return callback(new HttpError({
          status: err.code === 'ENOENT' ? 404 : 500,
          message: err.message
        }));
      }

      debug.handlers("Files in directory: " + files);
      return callback(null, files);
    });
  }

  function getMetadataGraph(metaFile, fileBaseUri, callback) {
    ldp.stat(metaFile, function(err, metaStats) {
      if (err) {
        return callback(err);
      }

      if (metaStats && metaStats.isFile()) {
        ldp.readFile(metaFile, function(err, rawMetadata) {
          if (err) {
            return callback(err);
          }

          var metadataGraph = $rdf.graph();
          try {
            $rdf.parse(
              rawMetadata,
              metadataGraph,
              fileBaseUri,
              'text/turtle');
          } catch (dirErr) {
            return callback(new HttpError({
              status: err.code === 'ENOENT' ? 404 : 500,
              message: dirErr.message
            }));
          }
          return callback(null, metadataGraph);
        });
      } else {
        return callback(null, $rdf.graph());
      }
    });
  }

  function addFile(ldp, resourceGraph, baseUri, uri, container, file, callback) {
      // Skip .meta and .acl
      if (S(file).endsWith(ldp.suffixMeta) || S(file).endsWith(ldp.suffixAcl)) {
        return callback(null);
      }

      // Get file stats
      ldp.stat(container + file, function (err, stats) {
        if (err) {
          // File does not exist, skip
          return callback(null);
        }

        var fileSubject = file + (stats.isDirectory() ? '/' : '');
        var fileBaseUri = utils.filenameToBaseUri(fileSubject, uri, ldp.root);

        // Add fileStats to resource Graph
        addStats(resourceGraph, fileSubject, stats);

        // Add to `contains` list
        resourceGraph.add(
          resourceGraph.sym(''),
          ns.ldp('contains'),
          resourceGraph.sym(fileSubject));

        // Set up a metaFile path
        var metaFile = container + file +
          (stats.isDirectory() ? '/' : '') +
          (S(file).endsWith(turtleExtension) ? '' : ldp.suffixMeta);

        getMetadataGraph(metaFile, baseUri, function(err, metadataGraph) {
          if (err) {
            metadataGraph = $rdf.graph();
          }

          // Add File, Container or BasicContainer
          if (stats.isDirectory()) {
            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.ldp('BasicContainer'));

            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.ldp('Container'));

            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.stat('Directory'));
          } else {
            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.stat('File'));
          }

          // Add type from metadataGraph
          var typeStatements = metadataGraph
            .statementsMatching(
              metadataGraph.sym(baseUri),
              ns.rdf('type'),
              undefined)
            .forEach(function (typeStatement) {
              // If the current is a file and its type is BasicContainer,
              // This is not possible, so do not infer its type!
              if (
                (
                  typeStatement.object.uri !== ns.ldp('BasicContainer').uri &&
                  typeStatement.object.uri !== ns.ldp('Container').uri
                ) ||
                !stats.isFile()
              ) {
                resourceGraph.add(
                  resourceGraph.sym(fileSubject),
                  typeStatement.predicate,
                  typeStatement.object);
              }
            });


          return callback(null);
        });
      });
  }

  var ldp = this;
  var baseUri = utils.filenameToBaseUri(filename, uri, ldp.root);
  var resourceGraph = $rdf.graph();

  try {
    $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
  } catch (err) {
    debug.handlers("GET/HEAD -- Error parsing data: " + err);
    return callback(new HttpError({
      status: 500,
      message: err.message
    }));
  }

  async.waterfall([
    // add container stats
    function (next) {
      ldp.stat(filename, function(err,  containerStats) {
        if (!err) {
          addStats(resourceGraph, '', containerStats);
          resourceGraph.add(
              resourceGraph.sym(''),
              ns.rdf('type'),
              ns.ldp('BasicContainer'));

            resourceGraph.add(
              resourceGraph.sym(''),
              ns.rdf('type'),
              ns.ldp('Container'));

            resourceGraph.add(
              resourceGraph.sym(''),
              ns.rdf('type'),
              ns.stat('Directory'));
        }
        next();
      });
    },
    // reading directory
    function (next) {
      readdir(filename, next);
    },
    // Iterate through all the files
    function (files, next) {
      async.each(
        files,
        function(file, cb) {
          addFile(ldp, resourceGraph, baseUri, uri, filename, file, cb);
        },
        next);
    }
  ],
  function (err, data) {
    var turtleData;
    try {
      turtleData = $rdf.serialize(
        undefined,
        resourceGraph,
        null,
        'text/turtle');
    } catch (parseErr) {
      debug.handlers("GET/HEAD -- Error serializing container: " + parseErr);
      return callback(new HttpError({
        status: 500,
        message: parseErr.message
      }));
    }
    return callback(null, turtleData);
  });
};

LDP.prototype.put = function (filePath, contents, callback) {
  // PUT requests not supported on containers. Use POST instead
  if (filePath[filePath.length - 1] === '/') {
    return callback(new HttpError({
      status: 409,
      message: "PUT to containers not supported. Use POST method instead"
    }));
  }

  mkdirp(path.dirname(filePath), function (err) {
      if (err) {
          debug.handlers("PUT -- Error creating directory: " + err);
          return callback(new HTTPError({
            status: err.code === 'ENOENT' ? 404 : 500,
            message: err.message
          }));
      }
      return fs.writeFile(filePath, contents, function() {
        if (err) {
          debug.handlers("PUT -- Error writing file: " + err);
          return callback(new HTTPError({
            status: err.code === 'ENOENT' ? 404 : 500,
            message: err.message
          }));
        }
        // Success!
        return callback(null);
      });
  });
};

LDP.prototype.get = function(filename, uri, includeBody, callback) {
    var ldp = this;
    ldp.stat(filename, function(err, stats) {
        // File does not exist
        if (err) {
            return callback(new HttpError({
                status: err.status,
                message:"Can't read file: " + err.message
            }));
        }

        // Just return, since resource exists
        if (!includeBody) {
            return callback(null);
        }

        // Found a container
        if (stats.isDirectory()) {
            return ldp.readContainerMeta(filename, function(err, metaFile) {
                if (err) {
                    metaFile = '';
                }
                ldp.listContainer(filename, uri, metaFile, function (err, data) {
                    if (err) {
                        debug.handlers('GET/HEAD -- Read error:' + err.message);
                        return callback(err);
                    }
                    // The ending `true`, specifies it is a container
                    return callback(null, data, true);
                });
            });
        }
        else {
            return ldp.readFile(filename, function (err, data) {
                // Error when reading
                if (err) {
                    debug.handlers('GET/HEAD -- Read error:' + err.message);
                    return callback(err);
                }
                debug.handlers('GET/HEAD -- Read Ok. Bytes read: ' + data.length);
                return callback(null, data);
            });
        }
    });
};

LDP.prototype.delete = function(filename, callback) {
    var ldp = this;
    ldp.stat(filename, function(err, stats) {
        if (err) {
            return callback(new HttpError({
              status:404,
              message: "Can't find file: " + err
            }));
        }

        if (stats.isDirectory()) {
            return ldp.deleteContainerMetadata(filename, callback);
        } else {
            return ldp.deleteResource(filename, callback);
        }
    });
};

LDP.prototype.deleteContainerMetadata = function(directory, callback) {
    if (directory[directory.length-1] !== '/') {
      directory += '/';
    }

    return fs.unlink(directory + this.suffixMeta, function(err, data) {
        if (err) {
            debug.container("DELETE -- unlink() error: " + err);
            return callback(new HttpError({
              status: err.code === 'ENOENT' ? 404 : 500,
              message: "Can't delete container: " + err
            }));
        }
        return callback(null, data);
    });
};

LDP.prototype.deleteResource = function(filename, callback) {
    return fs.unlink(filename, function(err, data) {
        if (err) {
            debug.container("DELETE -- unlink() error: " + err);
            return callback(new HttpError({
              status: err.code === 'ENOENT' ? 404 : 500,
              message: "Can't delete container: " + err
            }));
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

LDP.prototype.createNewResource = function(uri, resourcePath, resourceGraph, callback) {
    var ldp = this;
    var resourceURI = path.relative(ldp.root, resourcePath);
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
            return callback(new HttpError({
              message: "Cannot create new resource",
              status: err.code === 'ENOENT' ? 404 : 500
            }));
        }

        return callback(null);
    }
};

LDP.prototype.createNewContainer = function (uri, containerPath, containerGraph, callback) {
    var ldp = this;
    fs.mkdir(containerPath, mkdirCallback);

    function mkdirCallback(err) {
        if (err) {
            debug.container("Error creating directory for new container: " + err);
            ldp.releaseResourceUri(containerPath);
            return callback(new HttpError({
              message: "Cannot create new container",
              status: err.code === 'ENOENT' ? 404 : 500
            }));
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
            return callback(new HttpError({
              message: "Cannot create new container",
              status: err.code === 'ENOENT' ? 404 : 500
            }));
        }

        debug.container("Wrote container to " + containerPath);
        ldp.releaseResourceUri(containerPath);
        return callback(null);

    }
};

LDP.prototype.writeContainerMetadata = function (directory, container, callback) {
    if (directory[directory.length-1] !== '/') {
      directory += '/';
    }
    return fs.writeFile(directory + this.suffixMeta, container, callback);
};

LDP.prototype.isMetadataFile = function (filename) {
    if (path.extname(filename) === this.suffixMeta)
        return true;
    return false;
};

LDP.prototype.hasContainerMetadata = function(directory) {
    return fs.existsSync(directory + this.suffixMeta);
};
