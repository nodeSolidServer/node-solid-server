/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');

var options = require('./options.js');
var logging = require('./logging.js');

module.exports.uriToFilename = function(uri) {
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
};

module.exports.filenameToBaseUri = function(filename) {
    var uriPath = S(filename).strip(options.fileBase).toString();
    return path.join(options.uriBase, uriPath);
};
