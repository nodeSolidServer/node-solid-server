module.exports.addContainerStats = addContainerStats
module.exports.addFile = addFile
module.exports.addStats = addStats
module.exports.getMetadataGraph = getMetadataGraph
module.exports.readdir = readdir

var $rdf = require('rdflib')
var debug = require('./debug')
var error = require('./http-error')
var fs = require('fs')
var ns = require('solid-namespace')($rdf)
var S = require('string')
var turtleExtension = '.ttl'
var mime = require('mime-types')

function addContainerStats (ldp, reqUri, filename, resourceGraph, next) {
  ldp.stat(filename, function (err, containerStats) {
    if (!err) {
      addStats(resourceGraph, reqUri, containerStats)
      resourceGraph.add(
        resourceGraph.sym(reqUri),
        ns.rdf('type'),
        ns.ldp('BasicContainer'))

      resourceGraph.add(
        resourceGraph.sym(reqUri),
        ns.rdf('type'),
        ns.ldp('Container'))
    }
    next()
  })
}

function addFile (ldp, resourceGraph, containerUri, reqUri, uri, container, file, callback) {
  // Skip .meta and .acl
  if (S(file).endsWith(ldp.suffixMeta) || S(file).endsWith(ldp.suffixAcl)) {
    return callback(null)
  }

  // Get file stats
  ldp.stat(container + file, function (err, stats) {
    if (err) {
      // File does not exist, skip
      return callback(null)
    }

    // var fileSubject = file + (stats.isDirectory() ? '/' : '')
    // var fileBaseUri = utils.filenameToBaseUri(fileSubject, uri, root)

    // Add fileStats to resource Graph
    addStats(resourceGraph, reqUri, stats)

    // Add to `contains` list
    resourceGraph.add(
      resourceGraph.sym(containerUri),
      ns.ldp('contains'),
      resourceGraph.sym(reqUri))

    // Set up a metaFile path
    var metaFile = container + file +
      (stats.isDirectory() ? '/' : '') +
      (S(file).endsWith(turtleExtension) ? '' : ldp.suffixMeta)

    getMetadataGraph(ldp, metaFile, reqUri, function (err, metadataGraph) {
      if (err) {
        metadataGraph = $rdf.graph()
      }

      // Add Container or BasicContainer types
      if (stats.isDirectory()) {
        resourceGraph.add(
          metadataGraph.sym(reqUri),
          ns.rdf('type'),
          ns.ldp('BasicContainer'))

        resourceGraph.add(
          metadataGraph.sym(reqUri),
          ns.rdf('type'),
          ns.ldp('Container'))
      }
      // Add generic LDP type
      resourceGraph.add(
        metadataGraph.sym(reqUri),
        ns.rdf('type'),
        ns.ldp('Resource'))

      // Add type from metadataGraph
      metadataGraph
        .statementsMatching(
          metadataGraph.sym(reqUri),
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
              resourceGraph.sym(reqUri),
              typeStatement.predicate,
              typeStatement.object)
          }
        })

      return callback(null)
    })
  })
}

function addStats (resourceGraph, reqUri, stats) {
  resourceGraph.add(
    resourceGraph.sym(reqUri),
    ns.stat('mtime'),  // Deprecate?
    stats.mtime.getTime() / 1000)

  resourceGraph.add(
    resourceGraph.sym(reqUri),
    ns.dct('modified'),
    stats.mtime) // An actual datetime value from a Date object

  resourceGraph.add(
    resourceGraph.sym(reqUri),
    ns.stat('size'),
    stats.size)

  if (mime.lookup(reqUri)) { // Is the file has a well-known type,
    let type = 'http://www.w3.org/ns/iana/media-types/' + mime.lookup(reqUri) + '#Resource'
    resourceGraph.add(
      resourceGraph.sym(reqUri),
      ns.rdf('type'), // convert MIME type to RDF
      resourceGraph.sym(type)
    )
  }
}

function readdir (filename, callback) {
  debug.handlers('GET -- Reading directory')
  fs.readdir(filename, function (err, files) {
    if (err) {
      debug.handlers('GET -- Error reading files: ' + err)
      return callback(error(err, 'Can\'t read container'))
    }

    debug.handlers('Files in directory: ' + files)
    return callback(null, files)
  })
}

function getMetadataGraph (ldp, metaFile, fileBaseUri, callback) {
  ldp.stat(metaFile, function (err, metaStats) {
    if (err) {
      return callback(err)
    }

    if (metaStats && metaStats.isFile()) {
      ldp.readFile(metaFile, function (err, rawMetadata) {
        if (err) {
          return callback(err)
        }

        var metadataGraph = $rdf.graph()
        try {
          $rdf.parse(
            rawMetadata,
            metadataGraph,
            fileBaseUri,
            'text/turtle')
        } catch (dirErr) {
          return callback(error(err, 'Can\'t parse container metadata'))
        }
        return callback(null, metadataGraph)
      })
    } else {
      return callback(null, $rdf.graph())
    }
  })
}
