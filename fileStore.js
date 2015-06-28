/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');

var options = require('./options.js');
var logging = require('./logging.js');

function uriToFilename(uri) {
    var filename = path.join(options.fileBase, uri);
    // Make sure filename ends with '/'  if filename exists and is a directory.
    try {
        var fileStats = fs.statSync(filename);
        if (fileStats.isDirectory() && !S(filename).endsWith('/')) {
            filename += '/';
        } else if (fileStats.isFile() && S(filename).endsWith('/')) {
            filename = S(filename).chompRight('/').s;
        }
    } catch (err) {}
    return filename;
}

function uriToRelativeFilename(uri) {
    var filename = uriToFilename(uri);
    var relative = path.relative(options.fileBase, filename);
    return relative;
}

function filenameToBaseUri(filename) {
    var uriPath = S(filename).strip(options.fileBase).toString();
    return options.uriBase + uriPath;
}

exports.uriToFilename = uriToFilename;
exports.uriToRelativeFilename = uriToRelativeFilename;
exports.filenameToBaseUri = filenameToBaseUri;
