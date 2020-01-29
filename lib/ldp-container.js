module.exports.addContainerStats = addContainerStats
module.exports.addFile = addFile
module.exports.addStats = addStats
module.exports.readdir = readdir

const $rdf = require('rdflib')
const debug = require('./debug')
const error = require('./http-error')
const fs = require('fs')
const ns = require('solid-namespace')($rdf)
const mime = require('mime-types')
const path = require('path')

async function addContainerStats (ldp, reqUri, filename, resourceGraph) {
  const containerStats = await ldp.stat(filename)
  addStats(resourceGraph, reqUri, containerStats, filename)
  resourceGraph.add(
    resourceGraph.sym(reqUri),
    ns.rdf('type'),
    ns.ldp('BasicContainer'))
  resourceGraph.add(
    resourceGraph.sym(reqUri),
    ns.rdf('type'),
    ns.ldp('Container'))
}

async function addFile (ldp, resourceGraph, containerUri, reqUri, container, file) {
  // Skip .meta and .acl
  if (file.endsWith(ldp.suffixMeta) || file.endsWith(ldp.suffixAcl)) {
    return null
  }

  const filePath = path.join(container, file)

  // Get file stats
  let stats
  try {
    stats = await ldp.stat(filePath)
  } catch (e) {
    return null
  }
  let memberUri = reqUri + (stats.isDirectory() ? '/' : '')

  // Add fileStats to resource Graph
  addStats(resourceGraph, memberUri, stats, file)

  // Add to `contains` list
  resourceGraph.add(
    resourceGraph.sym(containerUri),
    ns.ldp('contains'),
    resourceGraph.sym(memberUri))

  // Set up a metaFile path
  // Earlier code used a .ttl file as its own meta file, which
  // caused massive data files to parsed as part of deirectory listings just looking for type triples
  const metaFile = containerUri + file + ldp.suffixMeta

  let metadataGraph
  try {
    metadataGraph = await getMetadataGraph(ldp, metaFile, memberUri)
  } catch (err) {
    metadataGraph = $rdf.graph()
  }

  // Add Container or BasicContainer types
  if (stats.isDirectory()) {
    resourceGraph.add(
      metadataGraph.sym(memberUri),
      ns.rdf('type'),
      ns.ldp('BasicContainer'))

    resourceGraph.add(
      metadataGraph.sym(memberUri),
      ns.rdf('type'),
      ns.ldp('Container'))
  }
  // Add generic LDP type
  resourceGraph.add(
    metadataGraph.sym(memberUri),
    ns.rdf('type'),
    ns.ldp('Resource'))

  // Add type from metadataGraph
  metadataGraph
    .statementsMatching(
      metadataGraph.sym(memberUri),
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

  return null
}

function addStats (resourceGraph, reqUri, stats, filename) {
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

  if (!reqUri.endsWith('/') && mime.lookup(filename)) { // Is the file has a well-known type,
    let type = 'http://www.w3.org/ns/iana/media-types/' + mime.lookup(filename) + '#Resource'
    resourceGraph.add(
      resourceGraph.sym(reqUri),
      ns.rdf('type'), // convert MIME type to RDF
      resourceGraph.sym(type)
    )
  }
}

function readdir (filename) {
  debug.handlers('GET -- Reading directory')
  return new Promise((resolve, reject) => {
    fs.readdir(filename, function (err, files) {
      if (err) {
        debug.handlers('GET -- Error reading files: ' + err)
        return reject(error(err, 'Can\'t read container'))
      }

      debug.handlers('Files in directory: ' + files.toString().slice(0, 100))
      return resolve(files)
    })
  })
}

async function getMetadataGraph (ldp, metaFile) {
  const metaStats = await ldp.stat(metaFile)
  if (metaStats && metaStats.isFile()) {
    try {
      return await ldp.getGraph(metaFile)
    } catch (err) {
      throw error(err, 'Can\'t parse container metadata')
    }
  } else {
    return $rdf.graph()
  }
}
