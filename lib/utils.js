exports.uriToFilename = uriToFilename
exports.uriToRelativeFilename = uriToRelativeFilename
exports.filenameToBaseUri = filenameToBaseUri
exports.uriAbs = uriAbs
exports.pathBasename = pathBasename
exports.uriBase = uriBase
exports.hasSuffix = hasSuffix
exports.getResourceLink = getResourceLink
exports.parse = parse
exports.serialize = serialize
exports.translate = translate
exports.stringToStream = stringToStream
exports.reqToPath = reqToPath

var fs = require('fs')
var path = require('path')
var S = require('string')
var $rdf = require('rdflib')
var from = require('from2')

function uriToFilename (uri, base) {
  uri = decodeURIComponent(uri)
  var filename = path.join(base, uri)
  // Make sure filename ends with '/'  if filename exists and is a directory.
  // TODO this sync operation can be avoided and can be left
  // to do, to other components, see `ldp.get`
  try {
    var fileStats = fs.statSync(filename)
    if (fileStats.isDirectory() && !S(filename).endsWith('/')) {
      filename += '/'
    } else if (fileStats.isFile() && S(filename).endsWith('/')) {
      filename = S(filename).chompRight('/').s
    }
  } catch (err) {}
  return filename
}

function uriToRelativeFilename (uri, base) {
  var filename = uriToFilename(uri, base)
  var relative = path.relative(base, filename)
  return relative
}

function filenameToBaseUri (filename, uri, base) {
  var uriPath = S(filename).strip(base).toString()
  return uri + '/' + uriPath
}

function uriAbs (req) {
  return req.protocol + '://' + req.get('host')
}

function uriBase (req) {
  return uriAbs(req) + (req.baseUrl || '')
}

function pathBasename (fullpath) {
  var bname = ''
  if (fullpath) {
    bname = (fullpath.lastIndexOf('/') === fullpath.length - 1)
      ? ''
      : path.basename(fullpath)
  }
  return bname
}

function hasSuffix (path, suffixes) {
  for (var i in suffixes) {
    if (path.indexOf(suffixes[i], path.length - suffixes[i].length) !== -1) {
      return true
    }
  }
  return false
}

function getResourceLink (filename, uri, base, suffix, otherSuffix) {
  var link = filenameToBaseUri(filename, uri, base)
  if (S(link).endsWith(suffix)) {
    return link
  } else if (S(link).endsWith(otherSuffix)) {
    return S(link).chompRight(otherSuffix).s + suffix
  } else {
    return link + suffix
  }
}

function parse (data, baseUri, contentType, callback) {
  var graph = $rdf.graph()
  try {
    $rdf.parse(data, graph, baseUri, contentType)
  } catch (err) {
    return callback(err)
  }
  return callback(null, graph)
}

function serialize (graph, baseUri, contentType, callback) {
  try {
    $rdf.serialize(null, graph, null, contentType, function (err, result) {
      if (err) {
        return callback(err)
      }
      if (result === undefined) {
        return callback(new Error('Error serializing the graph to ' +
          contentType))
      }

      return callback(null, result)
    })
  } catch (err) {
    callback(err)
  }
}

function translate (stream, baseUri, from, to, callback) {
  // Handle Turtle Accept header
  if (to === 'text/turtle' ||
      to === 'text/n3' ||
      to === 'application/turtle' ||
      to === 'application/n3') {
    to = 'text/turtle'
  }

  var data = ''
  stream
    .on('data', function (chunk) {
      data += chunk
    })
    .on('end', function () {
      parse(data, baseUri, from, function (err, graph) {
        if (err) return callback(err)
        serialize(graph, baseUri, to, function (err, data) {
          if (err) return callback(err)
          callback(null, data)
        })
      })
    })
}

function stringToStream (string) {
  return from(function (size, next) {
    // if there's no more content
    // left in the string, close the stream.
    if (!string || string.length <= 0) {
      return next(null, null)
    }

    // Pull in a new chunk of text,
    // removing it from the string.
    var chunk = string.slice(0, size)
    string = string.slice(size)

    // Emit "chunk" from the stream.
    next(null, chunk)
  })
}

function reqToPath (req) {
  var ldp = req.app.locals.ldp
  var root = ldp.idp ? ldp.root + req.hostname + '/' : ldp.root
  return uriToFilename(req.path, root)
}
