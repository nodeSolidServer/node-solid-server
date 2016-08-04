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

function addContainerStats (ldp, filename, resourceGraph, next) {
  ldp.stat(filename, function (err, containerStats) {
    if (!err) {
      addStats(resourceGraph, '', containerStats)
      resourceGraph.add(
        resourceGraph.sym(''),
        ns.rdf('type'),
        ns.ldp('BasicContainer'))

      resourceGraph.add(
        resourceGraph.sym(''),
        ns.rdf('type'),
        ns.ldp('Container'))
    }
    next()
  })
}

function addFile (ldp, resourceGraph, baseUri, uri, container, file, callback) {
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

    var fileSubject = file + (stats.isDirectory() ? '/' : '')
    // var fileBaseUri = utils.filenameToBaseUri(fileSubject, uri, root)

    // Add fileStats to resource Graph
    addStats(resourceGraph, fileSubject, stats)

    // Add to `contains` list
    resourceGraph.add(
      resourceGraph.sym(''),
      ns.ldp('contains'),
      resourceGraph.sym(fileSubject))

    // Set up a metaFile path
    var metaFile = container + file +
      (stats.isDirectory() ? '/' : '') +
      (S(file).endsWith(turtleExtension) ? '' : ldp.suffixMeta)

    getMetadataGraph(ldp, metaFile, baseUri, function (err, metadataGraph) {
      if (err) {
        metadataGraph = $rdf.graph()
      }

      // Add Container or BasicContainer types
      if (stats.isDirectory()) {
        resourceGraph.add(
          metadataGraph.sym(fileSubject),
          ns.rdf('type'),
          ns.ldp('BasicContainer'))

        resourceGraph.add(
          metadataGraph.sym(fileSubject),
          ns.rdf('type'),
          ns.ldp('Container'))
      }
      // Add generic LDP type
      resourceGraph.add(
        metadataGraph.sym(fileSubject),
        ns.rdf('type'),
        ns.ldp('Resource'))

      // Add type from metadataGraph
      metadataGraph
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
              typeStatement.object)
          }
        })

      return callback(null)
    })
  })
}

function addStats (resourceGraph, baseUri, stats) {
  resourceGraph.add(
    resourceGraph.sym(baseUri),
    ns.stat('mtime'),
    stats.mtime.getTime() / 1000)

  resourceGraph.add(
    resourceGraph.sym(baseUri),
    ns.stat('size'),
    stats.size)
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
