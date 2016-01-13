module.exports = LDP;
var mime = require('mime')
var path = require('path');
var regexp = require('node-regexp');
var S = require('string');
var fs = require('fs');
var $rdf = require('rdflib');
var async = require('async');
var fs = require('fs');
var url = require('url');
var mkdirp = require('fs-extra').mkdirp;
var uuid = require('node-uuid');
var debug = require('./debug');
var utils = require('./utils');
var ns = require('./vocab/ns').ns;
var HttpError = require('./http-error');
var stringToStream = require('./utils').stringToStream
var turtleExtension = '.ttl'

function LDP(argv) {
  argv = argv || {};
  var ldp = this;
  // From input
  ldp.forceUser = argv.forceUser;
  ldp.cache = argv.cache;
  ldp.live = argv.live;
  ldp.host = argv.host; // TODO maybe deprecated
  ldp.root = argv.root || process.cwd();
  // Add trailing /
  if (!(S(ldp.root).endsWith('/'))) {
    ldp.root += '/';
  }
  ldp.secret = argv.secret;
  ldp.webid = argv.webid;
  ldp.idp = argv.idp;
  ldp.leavePatchConnectionOpen = false;
  ldp.suffixAcl = argv.suffixAcl || ".acl";
  ldp.suffixMeta = argv.suffixMeta || ".meta";
  ldp.suffixSSE = argv.suffixSSE || '.events';
  ldp.turtleExtensions = ['.ttl', ldp.suffixAcl, ldp.suffixMeta, ldp.suffixSSE]
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
  if (argv.defaultApp !== false) {
    ldp.defaultApp = argv.defaultApp || 'https://linkeddata.github.io/warp/#/list/';
  }
  debug.settings("root: " + ldp.root);
  debug.settings("URI path filter regexp: " + ldp.pathFilter);
  debug.settings("Verbose: " + !!ldp.verbose);
  debug.settings("WebID: " + !!ldp.webid);
  debug.settings("Live: " + !!ldp.live);
  debug.settings("Identity Provider: " + ldp.idp);
  debug.settings("Default App: " + ldp.defaultApp);

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

LDP.prototype.createReadStream = function (filename) {
  return fs.createReadStream(filename, { 'encoding': 'utf8' })
}

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

LDP.prototype.listContainer = function (filename, uri, containerData, contentType, callback) {
  var ldp = this
  var host = url.parse(uri).hostname
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/';

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
    debug.handlers("GET -- Reading directory");
    fs.readdir(filename, function (err, files) {
      if (err) {
        debug.handlers("GET -- Error reading files: " + err);
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
        var fileBaseUri = utils.filenameToBaseUri(fileSubject, uri, root);

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

          // Add Container or BasicContainer types
          if (stats.isDirectory()) {
            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.ldp('BasicContainer'));

            resourceGraph.add(
              metadataGraph.sym(fileSubject),
              ns.rdf('type'),
              ns.ldp('Container'));
          }
          // Add generic LDP type
          resourceGraph.add(
            metadataGraph.sym(fileSubject),
            ns.rdf('type'),
            ns.ldp('Resource'));

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

  var baseUri = utils.filenameToBaseUri(filename, uri, root);
  var resourceGraph = $rdf.graph();

  try {
    $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle');
  } catch (err) {
    debug.handlers("GET -- Error parsing data: " + err);
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
        contentType);
    } catch (parseErr) {
      debug.handlers("GET -- Error serializing container: " + parseErr);
      return callback(new HttpError({
        status: 500,
        message: parseErr.message
      }));
    }
    return callback(null, turtleData);
  });
};

LDP.prototype.put = function (host, resourcePath, contents, callback) {
  var ldp = this;
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/';
  var filePath = utils.uriToFilename(resourcePath, root, host);

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
          return callback(new HttpError({
            status: err.code === 'ENOENT' ? 404 : 500,
            message: err.message
          }));
      }
      return fs.writeFile(filePath, contents, function (err) {
        if (err) {
          debug.handlers("PUT -- Error writing file: " + err);
          return callback(new HttpError({
            status: err.code === 'ENOENT' ? 404 : 500,
            message: err.message
          }));
        }
        // Success!
        return callback(null);
      });
  });
};

LDP.prototype.exists = function (host, reqPath, callback) {
  this.get(host, reqPath, undefined, false, undefined, callback)
}

LDP.prototype.get = function (host, reqPath, baseUri, includeBody, contentType, callback) {
    var ldp = this;
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/';
    var filename = utils.uriToFilename(reqPath, root);
    ldp.stat(filename, function (err, stats) {
        // File does not exist
        if (err) {
            return callback(new HttpError({
                status: err.status,
                message: "Can't read file: " + err.message
            }));
        }

        // Just return, since resource exists
        if (!includeBody) {
            return callback(null);
        }

        // Found a container
        if (stats.isDirectory()) {
            return ldp.readContainerMeta(filename, function (err, metaFile) {
                if (err) {
                    metaFile = '';
                }

                ldp.listContainer(filename, baseUri, metaFile, contentType, function (err, data) {
                  if (err) {
                    debug.handlers('GET container -- Read error:' + err.message);
                    return callback(err)
                  }
                  var stream = stringToStream(data)
                  return callback(null, stream, contentType, true);
                });
            });
        } else {
            var stream = ldp.createReadStream(filename)
            stream
              .on('error', function (err) {
                  debug.handlers('GET -- Read error:' + err.message);
                  return new HttpError({
                    status: err.code === 'ENOENT' ? 404 : 500,
                    message: "Can't read file: " + err
                  })
              })
              .on('open', function () {
                debug.handlers('GET -- Read Start.');
                var contentType = mime.lookup(filename);
                if (utils.hasSuffix(filename, ldp.turtleExtensions)) {
                    contentType = 'text/turtle';
                }
                callback(null, stream, contentType, false)
              })
        }
    });
};

LDP.prototype.delete = function(host, resourcePath, callback) {
    var ldp = this;
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/';
    var filename = utils.uriToFilename(resourcePath, root);
    ldp.stat(filename, function(err, stats) {
        if (err) {
            return callback(new HttpError({
              status: 404,
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

LDP.prototype.createNewResource = function(host, uri, resourcePath, resourceGraph, callback) {
    var ldp = this;
    var root = !ldp.idp ? ldp.root : ldp.root + host + '/';
    var resourceURI = path.relative(root, resourcePath);
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
